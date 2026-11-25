import { useMemo } from "react";
import { deviceInfo } from "../data/registry.js";
import { BACKEND, useBackendReadings } from "../lib/backend.js";
import { outOfRange } from "../lib/alerts.js";
import { fmtDateTime, fmtNum, fmtTimeSec, plural } from "../lib/format.js";
import { setParams } from "../lib/router.js";
import { Code, StatusIcon } from "../components/Badges.jsx";
import DataTable from "../components/DataTable.jsx";
import { FilterSelect, Segmented, SidePanel, Skeleton } from "../components/UI.jsx";

const VIEWS = [
  ["current", "Current backend format"],
  ["best", "Best case (full message)"],
];
const TYPES = [
  ["telemetry", "Telemetry"],
  ["event", "Door event"],
  ["diagnostic", "Diagnostic"],
  ["boot", "Boot"],
];

// Field by field: what each format carries, and what the dashboard uses it for
const COMPARE = [
  ["Device name / ID", "yes", "yes", "Knowing which trolley, truck or room"],
  ["Temperature", "part", "yes", "One value per unit today; the full message has one per sensor (trucks have two)"],
  ["Humidity", "part", "yes", "Same as temperature"],
  ["Time the reading was taken", "no", "yes", "Today only the time the server received it. Readings sent late after a network drop get the wrong time"],
  ["Sequence number", "no", "yes", "Finding lost and duplicate messages"],
  ["Door open / closed", "no", "yes", "Door alerts and the door bands on charts"],
  ["Battery and power", "no", "yes", "Low-battery and power-dip alerts"],
  ["Signal strength", "no", "yes", "Weak-signal warnings"],
  ["GPS position", "no", "yes", "Where a truck is"],
  ["SD card and buffered messages", "no", "yes", "Showing data that arrived late"],
  ["Sensor health (CRC, heater, errors)", "no", "yes", "Faulty-sensor alerts"],
  ["Boot and diagnostic messages", "no", "yes", "Restart alerts, firmware version"],
];
const CMP_WORD = { yes: "Yes", no: "No", part: "Partly" };

const slug = (id) => deviceInfo(id).name.replace(/\s+/g, "-");

// Turns the simulated full messages into rows shaped like the backend's `readings` table
function asCurrentFormat(raw) {
  const rows = [];
  for (const { msg, at } of raw) {
    if (msg.msg_type !== "telemetry" || !msg.readings?.length) continue;
    const r = msg.readings[0]; // the current format has room for one sensor only
    if (!Number.isFinite(r.temp_c)) continue;
    rows.push({
      id: `${msg.device_id}:${msg.seq}`,
      device: slug(msg.device_id),
      temperature: r.temp_c,
      humidity: r.rh,
      source: "sensor",
      received: msg.from_buffer ? at : msg.ts,
      late: msg.from_buffer ? msg.ts : null,
    });
  }
  return rows.reverse();
}

// What the sensor units send, in two versions (requested by the team):
//   Current   – the format the backend stores today (device, temperature, humidity)
//   Best case – the full message the dashboard was designed for
export default function Readings({ ctx }) {
  const { route } = ctx;
  const p = route.params;
  const v = p.v === "best" ? "best" : "current";
  const set = (patch) => setParams(route, patch);
  if (!ctx.ready) return <Skeleton rows={10} />;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Sensor readings</h1>
          <p className="muted">What the sensor units actually send. Switch between the format the backend stores today and the full message the dashboard was designed for.</p>
        </div>
      </div>
      <div className="toolbar">
        <Segmented label="Format" options={VIEWS} value={v} onChange={(x) => set({ v: x === "current" ? null : x, unit: null, type: null, msg: null })} />
      </div>
      {v === "current" ? <CurrentView ctx={ctx} /> : <BestView ctx={ctx} />}
      <Comparison ctx={ctx} />
    </div>
  );
}

function CurrentView({ ctx }) {
  const { route, now } = ctx;
  const p = route.params;
  const backend = useBackendReadings(true);
  const live = backend.status === "live";
  const simulated = useMemo(() => asCurrentFormat(ctx.rawMessages), [ctx.rawMessages]);
  const all = live
    ? backend.readings.map((r) => ({ ...r, received: Date.parse(r.received_at) / 1000, late: null }))
    : simulated;
  const devices = [...new Set(all.map((r) => r.device))].sort();
  const rows = p.unit ? all.filter((r) => r.device === p.unit) : all;
  const lateCount = rows.filter((r) => r.late).length;

  const columns = [
    {
      key: "received",
      label: "received_at",
      render: (r) => (
        <span title={fmtDateTime(r.received)}>
          {fmtTimeSec(r.received)}
          {r.late && <span className="tone-warn small"> · measured {fmtTimeSec(r.late)}, sent late</span>}
        </span>
      ),
      sort: (r) => r.received,
    },
    { key: "device", label: "device", render: (r) => <Code>{r.device}</Code>, sort: (r) => r.device },
    { key: "t", label: "temperature", align: "right", render: (r) => <span className={outOfRange(r.temperature) ? "tone-bad strong" : ""}>{fmtNum(r.temperature, 2, " °C")}</span>, sort: (r) => r.temperature },
    { key: "rh", label: "humidity", align: "right", render: (r) => fmtNum(r.humidity, 1, " %"), sort: (r) => r.humidity },
    { key: "source", label: "source", render: (r) => r.source },
  ];

  return (
    <>
      {backend.status === "checking" ? (
        <div className="notice">Checking the backend at <Code>{BACKEND}</Code>…</div>
      ) : live ? (
        <div className="notice notice-ok">
          <StatusIcon status="ok" />
          <span>
            <strong>Live from the backend.</strong> {plural(backend.readings.length, "reading")} from {plural(backend.devices.length, "device")}, newest first. Refreshes every 10 s.
          </span>
        </div>
      ) : (
        <div className="notice notice-warning">
          <StatusIcon status="warning" />
          <span>
            <strong>Can't reach the backend</strong> at <Code>{BACKEND}</Code> ({backend.error}). Showing simulated readings in the same format instead. Start it with <Code>docker compose up</Code> in{" "}
            <Code>system/backend</Code>; this page checks again every 10 s.
          </span>
        </div>
      )}

      <div className="stats-row">
        <div className="stat">
          <span className="stat-label">Devices</span>
          <span className="stat-value">{devices.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Readings shown</span>
          <span className="stat-value">{rows.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Newest</span>
          <span className="stat-value">{rows[0] ? fmtTimeSec(rows[0].received) : "–"}</span>
        </div>
        {!live && (
          <div className={`stat ${lateCount ? "stat-warn" : ""}`}>
            <span className="stat-label">Sent late (wrong time stored)</span>
            <span className="stat-value">{lateCount}</span>
          </div>
        )}
      </div>

      <div className="toolbar">
        <FilterSelect label="Device" value={p.unit} options={devices.map((d) => [d, d])} onChange={(x) => setParams(route, { unit: x })} />
        <span className="muted small">
          Columns as stored in the <Code>readings</Code> table. {live ? "" : `Simulated time ${fmtTimeSec(now)}.`}
        </span>
      </div>
      <section className="card flush">
        <DataTable label="Readings" columns={columns} rows={rows.slice(0, 300)} rowKey={(r) => r.id} keyboard={false} defaultSort={{ key: "received", dir: "desc" }} empty="No readings yet." />
      </section>
    </>
  );
}

function summary(msg) {
  if (!msg.readings?.length) return null;
  return msg.readings.map((r, i) => `S${i + 1} ${fmtNum(r.temp_c, 1, "°")} ${fmtNum(r.rh, 0, "%")}${r.crc_ok === false ? " CRC✗" : ""}`).join(" · ");
}

function BestView({ ctx }) {
  const { route } = ctx;
  const p = route.params;
  const raw = ctx.rawMessages;
  const rows = useMemo(
    () =>
      raw
        .filter((x) => (!p.unit || x.msg.device_id === p.unit) && (!p.type || x.msg.msg_type === p.type))
        .reverse(),
    [raw, p.unit, p.type],
  );
  const sel = p.msg ? raw.find((x) => String(x.n) === p.msg) : null;
  const missing = Object.values(ctx.devices).reduce((a, d) => a + d.missing.size, 0);

  const columns = [
    {
      key: "ts",
      label: "Measured",
      render: (x) => (
        <span title={fmtDateTime(x.msg.ts)}>
          {fmtTimeSec(x.msg.ts)}
          {x.msg.from_buffer && <span className="tone-warn small"> · from SD buffer</span>}
        </span>
      ),
      sort: (x) => x.msg.ts,
    },
    { key: "unit", label: "Unit", render: (x) => deviceInfo(x.msg.device_id).name, sort: (x) => deviceInfo(x.msg.device_id).name },
    { key: "type", label: "Type", render: (x) => x.msg.msg_type, sort: (x) => x.msg.msg_type },
    { key: "seq", label: "Seq", align: "right", render: (x) => <span className="mono">{x.msg.seq}</span>, sort: (x) => x.msg.seq },
    { key: "readings", label: "Sensors", render: (x) => <span className="mono">{summary(x.msg) ?? (x.msg.sensors ? `map: ${x.msg.sensors.length} sensors` : "–")}</span> },
    { key: "door", label: "Door", render: (x) => x.msg.door?.state ?? "–" },
    { key: "power", label: "Battery", align: "right", render: (x) => (x.msg.power ? (x.msg.power.source === "external" ? "plugged in" : `${x.msg.power.battery_pct}%`) : "–") },
    { key: "rssi", label: "Signal", align: "right", render: (x) => (x.msg.network ? `${x.msg.network.rssi} dBm` : "–") },
    { key: "gps", label: "GPS", render: (x) => (x.msg.gps ? <span className="mono">{x.msg.gps.lat.toFixed(4)}, {x.msg.gps.lon.toFixed(4)}</span> : "–") },
  ];

  return (
    <>
      <div className="notice">
        <StatusIcon status="info" />
        <span>
          <strong>Simulated.</strong> The sensor units don't send this format yet. These are the messages in the agreed JSON format (telemetry, door events, diagnostics and boot) that the rest of the dashboard runs on.
        </span>
      </div>
      <div className="stats-row">
        <div className="stat">
          <span className="stat-label">Messages received</span>
          <span className="stat-value">{ctx.stats.received}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Duplicates dropped</span>
          <span className="stat-value">{ctx.stats.duplicates}</span>
        </div>
        <div className={`stat ${missing ? "stat-warn" : ""}`}>
          <span className="stat-label">Lost (gaps in seq)</span>
          <span className="stat-value">{missing}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Rejected (invalid)</span>
          <span className="stat-value">{ctx.stats.rejected}</span>
        </div>
      </div>
      <div className="toolbar">
        <FilterSelect label="Unit" value={p.unit} options={Object.keys(ctx.devices).map((id) => [id, deviceInfo(id).name])} onChange={(x) => setParams(route, { unit: x })} />
        <FilterSelect label="Type" value={p.type} options={TYPES} onChange={(x) => setParams(route, { type: x })} />
        <span className="muted small">Latest {raw.length} messages. Select one to see its JSON.</span>
      </div>
      <section className="card flush">
        <DataTable label="Messages" columns={columns} rows={rows} defaultSort={{ key: "ts", dir: "desc" }} rowKey={(x) => String(x.n)} onOpen={(x) => setParams(route, { msg: String(x.n) })} activeKey={p.msg} empty="No messages match." />
      </section>
      <SidePanel open={!!sel} onClose={() => setParams(route, { msg: null })} width={720} title={sel ? `${sel.msg.msg_type} · ${deviceInfo(sel.msg.device_id).name}` : ""} subtitle={sel && `seq ${sel.msg.seq} · measured ${fmtDateTime(sel.msg.ts)}`}>
        {sel && <pre className="json">{JSON.stringify(sel.msg, null, 2)}</pre>}
      </SidePanel>
    </>
  );
}

function Comparison({ ctx }) {
  const multi = Object.values(ctx.devices).filter((d) => Object.keys(d.sensors).length > 1);
  return (
    <section className="card">
      <h2>What each format carries</h2>
      <div className="table-wrap">
        <table className="dtable compact">
          <thead>
            <tr>
              <th>Information</th>
              <th>Current</th>
              <th>Best case</th>
              <th>What the dashboard uses it for</th>
            </tr>
          </thead>
          <tbody>
            {COMPARE.map(([f, cur, best, why]) => (
              <tr key={f}>
                <td className="strong">{f}</td>
                <td className={`cmp-${cur}`}>{CMP_WORD[cur]}</td>
                <td className={`cmp-${best}`}>{CMP_WORD[best]}</td>
                <td className="muted">{why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {multi.length > 0 && (
        <p className="muted small">
          Example: {multi.map((d) => deviceInfo(d.id).name).join(" and ")} {multi.length > 1 ? "have" : "has"} more than one sensor. The current format sends only the first, so a fault on the
          other sensor (like Truck T-07's rear sensor in the simulation) would go unnoticed.
        </p>
      )}
    </section>
  );
}
