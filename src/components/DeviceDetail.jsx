import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LIMITS } from "../config.js";
import { deviceInfo } from "../data/registry.js";
import { doorOpenPeriods } from "../data/store.js";
import { sensorLabel } from "../lib/alerts.js";
import { fmtAgo, fmtDuration, fmtNum, fmtTime, fmtTimeSec } from "../lib/format.js";

const RANGES = [
  { label: "1 h", s: 3600 },
  { label: "3 h", s: 3 * 3600 },
  { label: "12 h", s: 12 * 3600 },
];
const SERIES = ["#3b82f6", "#14b8a6", "#a855f7", "#ec4899"];

export default function DeviceDetail({ device: d, alerts, now }) {
  const [range, setRange] = useState(RANGES[1].s);
  const info = deviceInfo(d.id);
  const from = now - range;
  const data = d.history.filter((p) => p.ts >= from);
  const sensorIds = Object.keys(d.sensors).filter((id) => d.history.some((p) => p[`t:${id}`] !== undefined));
  const doorPeriods = d.door ? doorOpenPeriods(d, now).filter(([, end]) => end >= from) : [];

  return (
    <section className="card detail">
      <div className="detail-head">
        <div>
          <h2>{info.name}</h2>
          <p className="muted small">
            {info.kind} · {info.assignment} · <code>{d.id}</code>
          </p>
        </div>
        <div className="range">
          {RANGES.map((r) => (
            <button key={r.s} className={r.s === range ? "active" : ""} onClick={() => setRange(r.s)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="detail-alerts">
          {alerts.map((a) => (
            <span key={a.id} className={`pill pill-${a.severity}`}>
              {a.title}
            </span>
          ))}
        </div>
      )}

      <div className="charts">
        <Chart
          title="Temperature (°C)"
          data={data}
          from={from}
          now={now}
          sensorIds={sensorIds}
          prefix="t:"
          device={d}
          unit="°C"
          limits
          doorPeriods={doorPeriods}
        />
        <Chart title="Relative humidity (%)" data={data} from={from} now={now} sensorIds={sensorIds} prefix="rh:" device={d} unit="%" doorPeriods={doorPeriods} />
      </div>
      <p className="muted small legend-note">
        {sensorIds.length > 1 && "Each line is one SHT45 sensor (multiplexer channel). "}
        Red dashed lines: limits {LIMITS.tempMinC}–{LIMITS.tempMaxC} °C (placeholder until the HACCP plan sets them).
        {d.door && " Amber bands: door open."}
      </p>

      <div className="health">
        <SensorsCard d={d} />
        {d.door && <DoorCard d={d} now={now} />}
        <QualityCard d={d} now={now} />
        <LocationCard d={d} />
        <InfoCard title="Power" ts={d.power?.ts} now={now} rows={d.power && [
          ["Source", d.power.source],
          ["Supply", d.power.supply_mv ? `${d.power.supply_mv} mV` : "–"],
          ["Battery", `${d.power.battery_pct}% · ${d.power.battery_mv} mV`],
        ]} />
        <InfoCard title="Storage (microSD)" ts={d.storage?.ts} now={now} rows={d.storage && [
          ["Card", d.storage.sd_present ? "present" : "missing"],
          ["Free", `${d.storage.sd_free_mb} / ${d.storage.sd_total_mb} MB`],
          ["Buffered messages", d.storage.buffered_msgs],
          ["Write errors", d.storage.write_errors],
        ]} />
        <InfoCard title="Network" ts={d.network?.ts} now={now} rows={d.network && [
          ["Type", d.network.type + (d.network.ssid ? ` · ${d.network.ssid} (ch ${d.network.channel})` : "")],
          ["Signal", `${d.network.rssi} dBm · ${rssiQuality(d.network.rssi)}`],
          ["IP", d.network.ip],
          ["NTP", d.network.ntp_synced ? `synced ${fmtTime(d.network.last_ntp_sync)}` : "not synced"],
          ["Reconnects", d.network.reconnects],
        ]} />
        <InfoCard title="System" ts={d.system?.ts} now={now} rows={d.system && [
          ["Firmware", `${d.system.fw} · ${d.system.chip} rev ${d.system.chip_rev}`],
          ["Uptime", d.system.uptime_s !== undefined ? fmtDuration(d.system.uptime_s) : "–"],
          ["Boots / last reset", `${d.system.boot_count} · ${d.system.reset_reason}`],
          ["Free heap (min)", d.system.free_heap ? `${(d.system.free_heap / 1024).toFixed(0)} KB (${(d.system.min_free_heap / 1024).toFixed(0)} KB)` : "–"],
          ["Chip temp", fmtNum(d.system.chip_temp_c, 1, " °C")],
          ["I²C errors", d.system.i2c_errors ?? "–"],
        ]} />
      </div>
    </section>
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
      <h3>{title}</h3>
      <ResponsiveContainer width="100%" height={230}>
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
            <Line
              key={id}
              dataKey={`${prefix}${id}`}
              name={sensorLabel(device, id)}
              stroke={SERIES[i % SERIES.length]}
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function InfoCard({ title, rows, ts, now }) {
  return (
    <div className="info">
      <h3>{title}</h3>
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
      {ts && <p className="muted small">Reported {fmtAgo(ts, now)}</p>}
    </div>
  );
}

function SensorsCard({ d }) {
  return (
    <div className="info wide">
      <h3>Sensors</h3>
      <table className="mini">
        <thead>
          <tr>
            <th>Channel</th>
            <th>Sensor ID</th>
            <th>Status</th>
            <th>CRC</th>
            <th>Read errors</th>
            <th>Heater last ran</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(d.sensors).map(([id, s]) => (
            <tr key={id}>
              <td>{s.ch !== undefined ? `${s.mux ?? ""} ch ${s.ch}` : "–"}</td>
              <td>
                <code>{id}</code>
              </td>
              <td>{s.status ?? "–"}</td>
              <td>{s.crc_ok === false ? <span className="bad">failed</span> : "ok"}</td>
              <td>{s.read_errors ?? "–"}</td>
              <td>{s.heater_last_run ? fmtTime(s.heater_last_run) : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DoorCard({ d, now }) {
  const recent = d.doorEvents.slice(-6).reverse();
  return (
    <div className="info">
      <h3>Door</h3>
      <dl>
        <div>
          <dt>State</dt>
          <dd>{d.door.state}</dd>
        </div>
        {d.door.open_count !== undefined && (
          <>
            <div>
              <dt>Last opening</dt>
              <dd>{fmtDuration(d.door.last_open_duration_s)}</dd>
            </div>
            <div>
              <dt>Openings / total (interval)</dt>
              <dd>
                {d.door.open_count} · {fmtDuration(d.door.total_open_s)}
              </dd>
            </div>
            <div>
              <dt>Alarm after</dt>
              <dd>{d.door.alarm_threshold_s} s</dd>
            </div>
          </>
        )}
      </dl>
      <h4>Recent events</h4>
      <ul className="events">
        {recent.map((e) => (
          <li key={`${e.ts}${e.state}`}>
            {fmtTimeSec(e.ts)} · {e.state}
          </li>
        ))}
        {recent.length === 0 && <li className="muted">none</li>}
      </ul>
      <p className="muted small">Updated {fmtAgo(d.door.ts, now)}</p>
    </div>
  );
}

function QualityCard({ d, now }) {
  return (
    <InfoCard
      title="Data quality"
      rows={[
        ["Interval", `${d.intervalS} s`],
        ["Time source", d.tsSource ?? "–"],
        ["Last seq", d.maxSeq ?? "–"],
        ["Missing / duplicate", `${d.missing.size} / ${d.duplicates}`],
        ["Received late (from SD)", d.bufferedReceived],
        ["CRC failures", d.crcFailures],
        ["Last full report", d.lastFullTs ? fmtAgo(d.lastFullTs, now) : "–"],
      ]}
    />
  );
}

function LocationCard({ d }) {
  if (!d.gps) return <InfoCard title="Location" />;
  const { lat, lon, fix_age_ms } = d.gps;
  const stale = fix_age_ms > 5 * 60 * 1000;
  return (
    <InfoCard
      title="Location (GPS)"
      rows={[
        ["Position", `${lat.toFixed(5)}, ${lon.toFixed(5)}`],
        ["Fix age", stale ? `${fmtDuration(fix_age_ms / 1000)} (stale)` : `${fix_age_ms} ms`],
        [
          "Map",
          <a key="map" href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`} target="_blank" rel="noreferrer">
            Open in OpenStreetMap
          </a>,
        ],
      ]}
    />
  );
}

function rssiQuality(rssi) {
  if (rssi > -60) return "good";
  if (rssi >= -75) return "usable";
  if (rssi >= -80) return "weak";
  return "unreliable";
}
