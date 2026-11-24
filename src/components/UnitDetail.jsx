import { useState } from "react";
import { LIMITS } from "../config.js";
import { deviceInfo } from "../data/registry.js";
import { doorOpenPeriods } from "../data/store.js";
import { batchesIn } from "../data/meals.js";
import { sensorLabel } from "../lib/alerts.js";
import { MSG_TIME_SOURCE, SIGNAL_HELP, powerInfo, resetText } from "../lib/describe.js";
import { fmtAgo, fmtDuration, fmtNum, fmtSpan, fmtTime, fmtTimeSec, fmtUntil } from "../lib/format.js";
import { deviceStats } from "../lib/stats.js";
import { VIEW_GROUPS } from "../lib/view.js";
import { Battery, Code, InfoTip, Signal, StatusBadge, StatusIcon } from "./Badges.jsx";
import { Segmented } from "./UI.jsx";
import TempChart, { SERIES } from "./TempChart.jsx";

export const RANGES = [
  { label: "1 h", s: 3600 },
  { label: "3 h", s: 3 * 3600 },
  { label: "12 h", s: 12 * 3600 },
];
const CATEGORY_LABELS = Object.fromEntries(VIEW_GROUPS.find((g) => g.key === "categories").items);

// Everything about one trolley, truck or room, by category. Shown in the side panel.
export default function UnitDetail({ device: d, devices, onSelect, alerts, now, range, onRange, categories, initialTab = "all", ctx }) {
  const [sensorChoice, setSensorFilter] = useState("all");
  const [tab, setTab] = useState(initialTab);
  const from = now - range;
  const data = d.history.filter((p) => p.ts >= from);
  const allSensorIds = Object.keys(d.sensors);
  // A sensor chosen on another unit falls back to "all"
  const sensorFilter = sensorChoice in d.sensors ? sensorChoice : "all";
  const sensorIds = (sensorFilter === "all" ? allSensorIds : [sensorFilter]).filter((id) => d.history.some((p) => p[`t:${id}`] !== undefined));
  const doorPeriods = d.door ? doorOpenPeriods(d, now).filter(([, end]) => end >= from) : [];
  const stats = deviceStats(d, from, now);
  const rangeLabel = RANGES.find((r) => r.s === range)?.label ?? "";
  const inside = batchesIn(ctx.picture.list, d.id);
  const series = (prefix) => sensorIds.map((id, i) => ({ key: `${prefix}${id}`, name: sensorLabel(d, id), color: SERIES[i % SERIES.length] }));

  // Categories this unit can show (door only if a door sensor is fitted), filtered in Customize view
  const available = Object.keys(CATEGORY_LABELS).filter((k) => categories[k] && (k !== "door" || d.door));
  const active = tab !== "all" && !available.includes(tab) ? "all" : tab;
  const show = (k) => available.includes(k) && (active === "all" || active === k);

  return (
    <div className="detail">
      <div className="detail-pickers">
        <label className="picker">
          <span className="picker-label">Unit</span>
          <select value={d.id} onChange={(e) => onSelect(e.target.value)}>
            {devices.map((x) => (
              <option key={x.id} value={x.id}>
                {deviceInfo(x.id).name}
              </option>
            ))}
          </select>
        </label>
        <label className="picker">
          <span className="picker-label">Sensor</span>
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
          <span className="picker-label">Period</span>
          <Segmented label="Period" options={RANGES.map((r) => [r.s, r.label])} value={range} onChange={onRange} />
        </div>
      </div>

      {alerts.length > 0 && (
        <section className={`card todo todo-${alerts.some((a) => a.severity === "critical") ? "critical" : "warning"}`}>
          <h3>What to do</h3>
          <ul>
            {alerts
              .filter((a) => a.severity !== "info")
              .map((a) => (
                <li key={a.id}>
                  <StatusIcon status={a.severity} />
                  <span>
                    <strong>{a.sentence}.</strong> {a.steps[0] ? `${a.steps[0]}.` : ""}
                  </span>
                </li>
              ))}
            {alerts
              .filter((a) => a.severity === "info")
              .map((a) => (
                <li key={a.id} className="muted">
                  <StatusIcon status="info" />
                  <span>{a.sentence}.</span>
                </li>
              ))}
          </ul>
        </section>
      )}

      <section className="category">
        <h3 className="category-title">Meals inside</h3>
        {inside.length ? (
          <ul className="inside">
            {inside.map((s) => (
              <li key={s.batch.code}>
                <button className="row-link" onClick={() => ctx.go("find", s.batch.code)}>
                  <StatusBadge status={s.status} />
                  <span>
                    {s.batch.meal} · {s.batch.qty} meals
                  </span>
                  <Code>{s.batch.code}</Code>
                  <span className="muted small">{s.batch.flightNo ? `${s.batch.flightNo} · departs ${fmtUntil(s.batch.flightDeparts, now)}` : `missed ${s.batch.missedFlight}`}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No meals in this unit right now.</p>
        )}
      </section>

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
      {available.length === 0 && <p className="muted">All detail categories are hidden. Turn some on in Settings → What the dashboard shows.</p>}

      {show("conditions") && (
        <Category title="Temperature & humidity">
          <div className="charts">
            <TempChart title="Temperature (°C)" data={data} series={series("t:")} from={from} to={now} limits doorPeriods={doorPeriods} />
            <TempChart title="Humidity (%)" data={data} series={series("rh:")} from={from} to={now} unit="%" doorPeriods={doorPeriods} />
          </div>
          <p className="muted small">Humidity is relative humidity: how much water the air holds compared with the most it could hold at that temperature. The limits are placeholders until the HACCP plan sets them.</p>
        </Category>
      )}

      {show("stats") && (
        <Category title={`Statistics · last ${rangeLabel}`}>
          <div className="statgrid">
            <Stat label="Lowest" value={fmtNum(stats.all?.min, 1, " °C")} />
            <Stat label="Average" value={fmtNum(stats.all?.avg, 1, " °C")} />
            <Stat label="Highest" value={fmtNum(stats.all?.max, 1, " °C")} tone={stats.all && stats.all.max > LIMITS.tempMaxC ? "bad" : ""} />
            <Stat label="Time in range" value={stats.all ? `${stats.all.inRangePct.toFixed(1)}%` : "–"} tone={stats.all && stats.all.inRangePct < 99 ? "bad" : ""} />
            <Stat label="Times it left the range" value={stats.all?.excursions ?? "–"} tone={stats.all?.excursions ? "bad" : ""} />
            {d.door && <Stat label="Door openings" value={stats.doorOpenings} />}
            {d.door && <Stat label="Door open in total" value={fmtSpan(stats.doorOpenS)} />}
          </div>
          <div className="table-wrap">
            <table className="dtable compact">
              <thead>
                <tr>
                  <th>Sensor</th>
                  <th className="num">Lowest</th>
                  <th className="num">Average</th>
                  <th className="num">Highest</th>
                  <th className="num">In range</th>
                  <th className="num">Time outside</th>
                  <th className="num">Humidity low / avg / high</th>
                  <th className="num">Readings</th>
                </tr>
              </thead>
              <tbody>
                {stats.sensors
                  .filter((s) => sensorFilter === "all" || s.sensorId === sensorFilter)
                  .map((s) => (
                    <tr key={s.sensorId}>
                      <td>{sensorLabel(d, s.sensorId)}</td>
                      <td className="num">{fmtNum(s.min, 1, " °C")}</td>
                      <td className="num">{fmtNum(s.avg, 1, " °C")}</td>
                      <td className={`num ${s.max > LIMITS.tempMaxC ? "tone-bad" : ""}`}>{fmtNum(s.max, 1, " °C")}</td>
                      <td className="num">{s.inRangePct.toFixed(1)}%</td>
                      <td className="num">{s.outsideS ? fmtSpan(s.outsideS) : "none"}</td>
                      <td className="num">
                        {fmtNum(s.rhMin, 0)} / {fmtNum(s.rhAvg, 0)} / {fmtNum(s.rhMax, 0, " %")}
                      </td>
                      <td className="num">{s.count}</td>
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
            title="Memory card (microSD)"
            ts={d.storage?.ts}
            now={now}
            rows={
              d.storage && [
                ["Card", d.storage.sd_present ? "Fitted" : <span className="tone-bad">Missing</span>],
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
    </div>
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
        <table className="dtable compact">
          <thead>
            <tr>
              <th>Sensor</th>
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
                <td>{sensorLabel(d, id)}</td>
                <td>
                  <Code>{id}</Code>
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
          ["Connection", n.type === "wifi" ? `Wi-Fi · ${n.ssid} (channel ${n.channel})` : "Mobile network (4G)"],
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
          ["Restarts / last reason", `${s.boot_count} · ${resetText(s.reset_reason)}`],
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
