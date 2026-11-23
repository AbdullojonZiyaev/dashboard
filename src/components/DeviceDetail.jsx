import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LIMITS } from "../config.js";
import { deviceInfo } from "../data/registry.js";
import { doorOpenPeriods } from "../data/store.js";
import { sensorLabel } from "../lib/alerts.js";
import { MSG_TIME_SOURCE, SIGNAL_HELP, powerInfo, unitStatus } from "../lib/describe.js";
import { fmtAgo, fmtDuration, fmtNum, fmtTime, fmtTimeSec } from "../lib/format.js";
import { deviceStats } from "../lib/stats.js";
import { VIEW_GROUPS } from "../lib/view.js";
import { Battery, InfoTip, SeverityBadge, Signal, StatusBadge } from "./Badges.jsx";

export const RANGES = [
  { label: "1 h", s: 3600 },
  { label: "3 h", s: 3 * 3600 },
  { label: "12 h", s: 12 * 3600 },
];
const SERIES = ["#2563eb", "#0d9488", "#9333ea", "#db2777"];
const CATEGORY_LABELS = Object.fromEntries(VIEW_GROUPS.find((g) => g.key === "categories").items);

export default function DeviceDetail({ device: d, devices, onSelect, alerts, allAlerts, now, range, onRange, categories }) {
  const [sensorChoice, setSensorFilter] = useState("all");
  const [tab, setTab] = useState("all");
  const info = deviceInfo(d.id);
  const status = unitStatus(d, allAlerts, now);
  const from = now - range;
  const data = d.history.filter((p) => p.ts >= from);
  const allSensorIds = Object.keys(d.sensors);
  // A sensor chosen on another unit falls back to "all"
  const sensorFilter = sensorChoice in d.sensors ? sensorChoice : "all";
  const sensorIds = (sensorFilter === "all" ? allSensorIds : [sensorFilter]).filter((id) =>
    d.history.some((p) => p[`t:${id}`] !== undefined),
  );
  const doorPeriods = d.door ? doorOpenPeriods(d, now).filter(([, end]) => end >= from) : [];
  const stats = deviceStats(d, from, now);
  const rangeLabel = RANGES.find((r) => r.s === range)?.label ?? "";

  // Categories this unit can show (door only if a door sensor is fitted), filtered by the sidebar
  const available = Object.keys(CATEGORY_LABELS).filter((k) => categories[k] && (k !== "door" || d.door));
  const active = tab !== "all" && !available.includes(tab) ? "all" : tab;
  const show = (k) => available.includes(k) && (active === "all" || active === k);

  return (
    <section className="card detail">
      <div className="detail-head">
        <div className="detail-pickers">
          <label className="picker">
            <span className="muted small">Unit</span>
            <select value={d.id} onChange={(e) => onSelect(e.target.value)}>
              {devices.map((x) => (
                <option key={x.id} value={x.id}>
                  {deviceInfo(x.id).name} — {deviceInfo(x.id).assignment}
                </option>
              ))}
            </select>
          </label>
          <label className="picker">
            <span className="muted small">Sensor</span>
            <select value={sensorFilter} onChange={(e) => setSensorFilter(e.target.value)}>
              <option value="all">All sensors ({allSensorIds.length})</option>
              {allSensorIds.map((id) => (
                <option key={id} value={id}>
                  {sensorLabel(d, id)} · {id}
                </option>
              ))}
            </select>
          </label>
          <div className="picker">
            <span className="muted small">Period</span>
            <div className="range">
              {RANGES.map((r) => (
                <button key={r.s} className={r.s === range ? "active" : ""} onClick={() => onRange(r.s)}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="detail-title">
          <h2>
            {info.name} <StatusBadge status={status} />
          </h2>
          <p className="muted small">
            {info.kind} · {info.assignment} · <code>{d.id}</code>
          </p>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="detail-alerts">
          {alerts.map((a) => (
            <span key={a.id} className={`detail-alert alert-${a.severity}`}>
              <SeverityBadge severity={a.severity} /> {a.title}
            </span>
          ))}
        </div>
      )}

      <nav className="tabs" aria-label="Detail categories">
        <button className={active === "all" ? "active" : ""} onClick={() => setTab("all")}>
          All
        </button>
        {available.map((k) => (
          <button key={k} className={active === k ? "active" : ""} onClick={() => setTab(k)}>
            {CATEGORY_LABELS[k]}
          </button>
        ))}
      </nav>
      {available.length === 0 && <p className="muted">All detail categories are hidden. Turn some on in the View sidebar.</p>}

      {show("conditions") && (
        <Category title="Temperature & humidity">
          <div className="charts">
            <Chart title="Temperature (°C)" data={data} from={from} now={now} sensorIds={sensorIds} prefix="t:" device={d} unit="°C" limits doorPeriods={doorPeriods} />
            <Chart title="Humidity (%)" data={data} from={from} now={now} sensorIds={sensorIds} prefix="rh:" device={d} unit="%" doorPeriods={doorPeriods} />
          </div>
          <p className="muted small legend-note">
            {sensorIds.length > 1 && "Each line is one sensor (multiplexer channel). "}
            <span className="key key-limit" /> Limits {LIMITS.tempMinC}–{LIMITS.tempMaxC} °C (placeholder until the HACCP plan sets them).
            {d.door && (
              <>
                {" "}
                <span className="key key-door" /> Door open.
              </>
            )}
          </p>
        </Category>
      )}

      {show("stats") && (
        <Category title={`Statistics · last ${rangeLabel}`}>
          <div className="statgrid">
            <Stat label="Lowest" value={fmtNum(stats.all?.min, 1, " °C")} />
            <Stat label="Average" value={fmtNum(stats.all?.avg, 1, " °C")} />
            <Stat label="Highest" value={fmtNum(stats.all?.max, 1, " °C")} tone={stats.all && stats.all.max > LIMITS.tempMaxC ? "bad" : ""} />
            <Stat label="Time in range" value={stats.all ? `${stats.all.inRangePct.toFixed(1)}%` : "–"} tone={stats.all && stats.all.inRangePct < 99 ? "warn" : "good"} />
            <Stat label="Excursions" value={stats.all?.excursions ?? "–"} tone={stats.all?.excursions ? "bad" : "good"} />
            {d.door && <Stat label="Door openings" value={stats.doorOpenings} />}
            {d.door && <Stat label="Door open in total" value={fmtDuration(stats.doorOpenS)} />}
          </div>
          <div className="table-wrap">
            <table className="mini">
              <thead>
                <tr>
                  <th>Sensor</th>
                  <th>Min</th>
                  <th>Avg</th>
                  <th>Max</th>
                  <th>In range</th>
                  <th>Time out of range</th>
                  <th>Humidity min / avg / max</th>
                  <th>Readings</th>
                </tr>
              </thead>
              <tbody>
                {stats.sensors
                  .filter((s) => sensorFilter === "all" || s.sensorId === sensorFilter)
                  .map((s) => (
                    <tr key={s.sensorId}>
                      <td>
                        {sensorLabel(d, s.sensorId)} <code className="muted">{s.sensorId}</code>
                      </td>
                      <td>{fmtNum(s.min, 1, " °C")}</td>
                      <td>{fmtNum(s.avg, 1, " °C")}</td>
                      <td className={s.max > LIMITS.tempMaxC ? "tone-bad" : ""}>{fmtNum(s.max, 1, " °C")}</td>
                      <td>{s.inRangePct.toFixed(1)}%</td>
                      <td>{s.outsideS ? fmtDuration(s.outsideS) : "none"}</td>
                      <td>
                        {fmtNum(s.rhMin, 0)} / {fmtNum(s.rhAvg, 0)} / {fmtNum(s.rhMax, 0, " %")}
                      </td>
                      <td>{s.count}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Category>
      )}

      {show("sensors") && (
        <Category title="Sensors">
          <SensorsTable d={d} sensorFilter={sensorFilter} />
        </Category>
      )}

      <div className="health">
        {show("door") && <DoorCard d={d} now={now} />}
        {show("location") && <LocationCard d={d} now={now} />}
        {show("power") && <PowerCard d={d} now={now} />}
        {show("connectivity") && <NetworkCard d={d} now={now} />}
        {show("connectivity") && (
          <InfoCard
            title="Storage (microSD)"
            ts={d.storage?.ts}
            now={now}
            rows={
              d.storage && [
                ["Card", d.storage.sd_present ? "Present" : <span className="tone-bad">Missing</span>],
                ["Free space", `${d.storage.sd_free_mb} of ${d.storage.sd_total_mb} MB (${Math.round((d.storage.sd_free_mb / d.storage.sd_total_mb) * 100)}%)`],
                ["Waiting to send", `${d.storage.buffered_msgs} messages`],
                ["Write errors", d.storage.write_errors],
              ]
            }
          />
        )}
        {show("system") && <SystemCard d={d} now={now} />}
        {show("quality") && <QualityCard d={d} now={now} />}
      </div>
    </section>
  );
}

function Category({ title, children }) {
  return (
    <section className="category">
      <h3 className="category-title">{title}</h3>
      {children}
    </section>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ""}`}>
      <div className="muted small">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

function Chart({ title, data, from, now, sensorIds, prefix, device, unit, limits, doorPeriods }) {
  const values = data.flatMap((p) => sensorIds.map((id) => p[`${prefix}${id}`]).filter(Number.isFinite));
  let domain = ["auto", "auto"];
  if (limits && values.length) {
    domain = [Math.floor(Math.min(...values, LIMITS.tempMinC) - 1), Math.ceil(Math.max(...values, LIMITS.tempMaxC) + 1)];
  }
  return (
    <div className="chart">
      <h4>{title}</h4>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="currentColor" strokeOpacity={0.12} />
          <XAxis dataKey="ts" type="number" domain={[from, now]} allowDataOverflow tickFormatter={fmtTime} tick={{ fill: "currentColor", fontSize: 12 }} stroke="currentColor" strokeOpacity={0.4} />
          <YAxis domain={domain} tick={{ fill: "currentColor", fontSize: 12 }} stroke="currentColor" strokeOpacity={0.4} />
          {doorPeriods.map(([a, b]) => (
            <ReferenceArea key={a} x1={Math.max(a, from)} x2={Math.min(b, now)} fill="#f59e0b" fillOpacity={0.18} ifOverflow="hidden" />
          ))}
          {limits && <ReferenceLine y={LIMITS.tempMaxC} stroke="#dc2626" strokeDasharray="5 4" />}
          {limits && <ReferenceLine y={LIMITS.tempMinC} stroke="#dc2626" strokeDasharray="5 4" />}
          <Tooltip
            labelFormatter={(ts) => fmtTimeSec(ts)}
            formatter={(v, name) => [`${v} ${unit}`, name]}
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" }}
          />
          {sensorIds.map((id, i) => (
            <Line key={id} dataKey={`${prefix}${id}`} name={sensorLabel(device, id)} stroke={SERIES[i % SERIES.length]} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function InfoCard({ title, rows, ts, now, children }) {
  return (
    <div className="info">
      <h4>{title}</h4>
      {rows ? (
        <dl>
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="muted small">No full report yet.</p>
      )}
      {children}
      {ts && <p className="muted small">Reported {fmtAgo(ts, now)}</p>}
    </div>
  );
}

function SensorsTable({ d, sensorFilter }) {
  const [q, setQ] = useState("");
  const rows = Object.entries(d.sensors).filter(
    ([id, s]) => (sensorFilter === "all" || id === sensorFilter) && `${id} ch ${s.ch} ${s.model ?? ""}`.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <>
      {Object.keys(d.sensors).length > 1 && (
        <input type="search" className="search search-sm" placeholder="Search sensor ID or channel…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search sensors" />
      )}
      <div className="table-wrap">
        <table className="mini">
          <thead>
            <tr>
              <th>Channel</th>
              <th>Sensor ID</th>
              <th>Model</th>
              <th>Temperature</th>
              <th>Humidity</th>
              <th>Status</th>
              <th>Checksum</th>
              <th>Read errors</th>
              <th>Heater last ran</th>
              <th>Last good reading</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([id, s]) => (
              <tr key={id}>
                <td>{s.ch !== undefined ? `${s.mux ?? ""} ch ${s.ch}` : "–"}</td>
                <td>
                  <code>{id}</code>
                </td>
                <td>{s.model ?? "SHT45"}</td>
                <td>{fmtNum(s.temp_c, 2, " °C")}</td>
                <td>{fmtNum(s.rh, 1, " %")}</td>
                <td>{s.status === "ok" ? <span className="tone-good">OK</span> : <span className="tone-bad">{s.status ?? "–"}</span>}</td>
                <td>{s.crc_ok === false ? <span className="tone-bad">Failed</span> : "OK"}</td>
                <td>{s.read_errors ?? "–"}</td>
                <td>{s.heater_last_run ? fmtTime(s.heater_last_run) : "–"}</td>
                <td>{s.last_ok_ts ? fmtTimeSec(s.last_ok_ts) : "–"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="muted">
                  No sensors match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function DoorCard({ d, now }) {
  const recent = d.doorEvents.slice(-6).reverse();
  return (
    <InfoCard
      title="Door"
      ts={d.door.ts}
      now={now}
      rows={[
        ["State", d.door.state === "open" ? <span className="tone-warn">Open</span> : "Closed"],
        ...(d.door.open_count !== undefined
          ? [
              ["Last opening lasted", fmtDuration(d.door.last_open_duration_s)],
              ["Openings this report", `${d.door.open_count} (${fmtDuration(d.door.total_open_s)} open)`],
              ["Alarm after", `${d.door.alarm_threshold_s} s open`],
            ]
          : []),
      ]}
    >
      <h5>Recent door events</h5>
      <ul className="events">
        {recent.map((e) => (
          <li key={`${e.ts}${e.state}`}>
            {fmtTimeSec(e.ts)} · {e.state === "open" ? "opened" : "closed"}
          </li>
        ))}
        {recent.length === 0 && <li className="muted">none</li>}
      </ul>
    </InfoCard>
  );
}

function PowerCard({ d, now }) {
  const p = powerInfo(d.power);
  return (
    <InfoCard
      title="Power"
      ts={d.power?.ts}
      now={now}
      rows={
        d.power && [
          ["Power source", p.source === "Mains" ? "Plugged in (mains)" : "Battery only"],
          ["Battery", <Battery key="b" info={p} />],
          ["Battery voltage", `${(d.power.battery_mv / 1000).toFixed(2)} V`],
          ["Supply voltage", d.power.supply_mv ? `${(d.power.supply_mv / 1000).toFixed(2)} V` : "– (not plugged in)"],
        ]
      }
    />
  );
}

function NetworkCard({ d, now }) {
  const n = d.network;
  return (
    <InfoCard
      title={
        <>
          Network <InfoTip text={SIGNAL_HELP} />
        </>
      }
      ts={n?.ts}
      now={now}
      rows={
        n && [
          ["Connection", n.type === "wifi" ? `Wi-Fi · ${n.ssid} (channel ${n.channel})` : "Cellular (4G)"],
          ["Signal", <Signal key="s" rssi={n.rssi} />],
          ["IP address", n.ip],
          ["Clock sync (NTP)", n.ntp_synced ? `Synced ${fmtTime(n.last_ntp_sync)}` : <span className="tone-warn">Not synced</span>],
          ["Reconnects", n.reconnects],
        ]
      }
    />
  );
}

function SystemCard({ d, now }) {
  const s = d.system;
  return (
    <InfoCard
      title="Device system"
      ts={s?.ts}
      now={now}
      rows={
        s && [
          ["Firmware", s.fw],
          ["Chip", `${s.chip} rev ${s.chip_rev}`],
          ["Running for", s.uptime_s !== undefined ? fmtDuration(s.uptime_s) : "–"],
          ["Restarts / last reason", `${s.boot_count} · ${s.reset_reason}`],
          ["Free memory (lowest)", s.free_heap ? `${(s.free_heap / 1024).toFixed(0)} KB (${(s.min_free_heap / 1024).toFixed(0)} KB)` : "–"],
          ["Chip temperature", fmtNum(s.chip_temp_c, 1, " °C")],
          ["Sensor bus (I²C) errors", s.i2c_errors ?? "–"],
        ]
      }
    />
  );
}

function QualityCard({ d, now }) {
  return (
    <InfoCard
      title="Data quality"
      rows={[
        ["Reports every", `${d.intervalS} s`],
        ["Time source", MSG_TIME_SOURCE[d.tsSource] ?? "–"],
        ["Last message number", d.maxSeq ?? "–"],
        ["Missing / duplicate", `${d.missing.size} / ${d.duplicates}`],
        ["Sent late from SD card", d.bufferedReceived],
        ["Checksum failures", d.crcFailures],
        ["Last full report", d.lastFullTs ? fmtAgo(d.lastFullTs, now) : "–"],
      ]}
    />
  );
}

function LocationCard({ d, now }) {
  if (!d.gps) return <InfoCard title="Location" />;
  const { lat, lon, fix_age_ms } = d.gps;
  const stale = fix_age_ms > 5 * 60 * 1000;
  return (
    <InfoCard
      title="Location (GPS)"
      ts={d.gps.ts}
      now={now}
      rows={[
        ["Latitude, longitude", `${lat.toFixed(5)}, ${lon.toFixed(5)}`],
        ["GPS fix", stale ? <span className="tone-warn">{fmtDuration(fix_age_ms / 1000)} old (indoors)</span> : `${(fix_age_ms / 1000).toFixed(1)} s old`],
        [
          "Map",
          <a key="map" href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`} target="_blank" rel="noreferrer">
            Open in OpenStreetMap ↗
          </a>,
        ],
      ]}
    />
  );
}
