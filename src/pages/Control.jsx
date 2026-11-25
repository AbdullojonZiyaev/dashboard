import { deviceInfo } from "../data/registry.js";
import { sensorLabel } from "../lib/alerts.js";
import { STATUS } from "../lib/describe.js";
import { fmtDateTime, fmtNum, fmtSpan, fmtTime } from "../lib/format.js";
import { setParams } from "../lib/router.js";
import { SAMPLE_OPTIONS, SPC, controlChart } from "../lib/spc.js";
import { Code, StatusBadge, StatusIcon } from "../components/Badges.jsx";
import ControlChart from "../components/ControlChart.jsx";
import DataTable from "../components/DataTable.jsx";
import { RANGES } from "../components/UnitDetail.jsx";
import { EmptyState, Segmented, Skeleton } from "../components/UI.jsx";

const RANK = { critical: 0, warning: 1, offline: 2, ok: 3 };
const sensorsOf = (d) => Object.keys(d.sensors).filter((id) => d.history.some((p) => p[`t:${id}`] !== undefined));

// Temperature control chart per location and sensor (requested by the QA team)
export default function Control({ ctx }) {
  const { route, now, deviceList } = ctx;
  if (!ctx.ready) return <Skeleton tiles={4} rows={8} />;
  const p = route.params;
  const set = (patch) => setParams(route, patch);
  const rangeS = Number(p.range) || RANGES[0].s;
  const sampleS = Number(p.every) || SAMPLE_OPTIONS[1].s;

  // Every sensor at every location, with its chart worked out
  const all = deviceList.flatMap((d) => sensorsOf(d).map((sid) => ({ d, sid, key: `${d.id}|${sid}`, cc: controlChart(d, sid, now, rangeS, sampleS) })));
  if (!all.length) return <EmptyState>No sensor has sent temperature readings yet.</EmptyState>;
  const worst = all.slice().sort((a, b) => RANK[a.cc.status] - RANK[b.cc.status])[0];
  const sel = all.find((x) => x.d.id === p.unit && x.sid === p.sensor) ?? all.find((x) => x.d.id === p.unit) ?? worst;
  const { d, sid, cc } = sel;
  const last = cc.points[cc.points.length - 1];
  const status = STATUS[cc.status];

  const columns = [
    { key: "loc", label: "Location", render: (x) => deviceInfo(x.d.id).name, sort: (x) => deviceInfo(x.d.id).name },
    { key: "sensor", label: "Sensor", render: (x) => <span>{sensorLabel(x.d, x.sid)} <span className="muted small">{x.sid}</span></span> },
    { key: "now", label: "Now", align: "right", render: (x) => fmtNum(x.cc.points.at(-1)?.v, 1, " °C"), sort: (x) => x.cc.points.at(-1)?.v },
    { key: "cl", label: "CL", align: "right", render: (x) => fmtNum(x.cc.limits?.cl, 2, " °C"), sort: (x) => x.cc.limits?.cl },
    { key: "lim", label: "LCL – UCL", align: "right", render: (x) => (x.cc.limits ? `${x.cc.limits.lcl.toFixed(2)} – ${x.cc.limits.ucl.toFixed(2)} °C` : "–") },
    { key: "sig", label: "Signals in period", align: "right", render: (x) => x.cc.events.length || "–", sort: (x) => x.cc.events.length },
    { key: "status", label: "Status", render: (x) => <StatusBadge status={STATUS[x.cc.status]} />, sort: (x) => RANK[x.cc.status] },
  ];

  return (
    <div className="page control">
      <div className="page-head">
        <div>
          <h1>Temperature control chart</h1>
          <p className="muted">
            {deviceInfo(d.id).name} · {sensorLabel(d, sid)} <Code>{sid}</Code>
          </p>
        </div>
        <StatusBadge status={status} size="lg" />
      </div>

      <div className="detail-pickers">
        <label className="picker">
          <span className="picker-label">Location</span>
          <select value={d.id} onChange={(e) => set({ unit: e.target.value, sensor: null })}>
            {deviceList.map((x) => (
              <option key={x.id} value={x.id}>
                {deviceInfo(x.id).name}
              </option>
            ))}
          </select>
        </label>
        <label className="picker">
          <span className="picker-label">Sensor</span>
          <select value={sid} onChange={(e) => set({ unit: d.id, sensor: e.target.value })}>
            {sensorsOf(d).map((id) => (
              <option key={id} value={id}>
                {sensorLabel(d, id)} · {id}
              </option>
            ))}
          </select>
        </label>
        <div className="picker">
          <span className="picker-label">Period</span>
          <Segmented label="Period" options={RANGES.map((r) => [r.s, r.label])} value={rangeS} onChange={(v) => set({ range: v === RANGES[0].s ? null : v })} />
        </div>
        <div className="picker">
          <span className="picker-label">One reading every</span>
          <Segmented label="Reading interval" options={SAMPLE_OPTIONS.map((o) => [o.s, o.label])} value={sampleS} onChange={(v) => set({ every: v === SAMPLE_OPTIONS[1].s ? null : v })} />
        </div>
      </div>

      <div className="stats-row">
        <div className={`stat ${last && last.flags.includes("spec") ? "stat-bad" : last?.flags.length ? "stat-warn" : ""}`}>
          <span className="stat-label">Current reading</span>
          <span className="stat-value stat-big">{fmtNum(last?.v, 1, "°C")}</span>
          <span className="muted small">{last ? fmtTime(last.ts) : "no data"}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Process average (CL)</span>
          <span className="stat-value stat-big">{fmtNum(cc.limits?.cl, 1, "°C")}</span>
          <span className="muted small">from {cc.limits ? `${cc.limits.n} readings` : "too few readings"}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Control limits (LCL – UCL)</span>
          <span className="stat-value stat-big">{cc.limits ? `${cc.limits.lcl.toFixed(1)} – ${cc.limits.ucl.toFixed(1)}°C` : "–"}</span>
          <span className="muted small">calculated from sensor data</span>
        </div>
        <div className="stat">
          <span className="stat-label">Specification limits (LSL – USL)</span>
          <span className="stat-value stat-big">
            {cc.spec.lsl.toFixed(1)} – {cc.spec.usl.toFixed(1)}°C
          </span>
          <span className="muted small">fixed food-safety requirement</span>
        </div>
      </div>

      <section className="card">
        <ControlChart points={cc.points} limits={cc.limits} spec={cc.spec} events={cc.events} from={now - rangeS} to={now} />
      </section>

      <div className="two-col">
        <section className="card">
          <h2>Recent alert history</h2>
          {cc.events.length ? (
            <ul className="event-list">
              {cc.events.slice(0, 8).map((e) => (
                <li key={`${e.rule}${e.ts}`}>
                  <StatusIcon status={e.severity} size={22} />
                  <span>
                    <strong>{e.title}</strong>
                    <span className="muted small">
                      {fmtTime(e.ts)} · {e.rule === "trend" || e.rule === "shift" ? e.detail : `${e.v.toFixed(1)}°C · ${e.detail}`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No rule was broken in this period. The process is in control.</p>
          )}
          {cc.events.length > 8 && <p className="muted small">and {cc.events.length - 8} earlier. Switch to “Show as table” to see every reading.</p>}
        </section>

        <section className="card">
          <h2>How the limits are worked out</h2>
          <dl className="facts facts-tight">
            <div>
              <dt>USL / LSL</dt>
              <dd>Fixed food-safety limits ({cc.spec.lsl}–{cc.spec.usl} °C). Change them in the safety-limit settings.</dd>
            </div>
            <div>
              <dt>CL</dt>
              <dd>Average of the baseline readings: {fmtNum(cc.limits?.cl, 2, " °C")}</dd>
            </div>
            <div>
              <dt>UCL / LCL</dt>
              <dd>
                CL ± 3 × MR̄ ÷ 1.128 = {fmtNum(cc.limits?.cl, 2)} ± 3 × {fmtNum(cc.limits?.mrBar, 3)} ÷ 1.128
              </dd>
            </div>
            <div>
              <dt>Baseline</dt>
              <dd>
                {cc.limits ? `${cc.limits.n} readings, one every ${fmtSpan(sampleS)}, since ${fmtDateTime(cc.baselineFrom)}` : `Needs at least ${SPC.minPoints} readings`}
              </dd>
            </div>
          </dl>
          <p className="muted small">
            Rules: a reading outside USL/LSL is <strong>Act now</strong>. A reading outside UCL/LCL, {SPC.trendRun} readings in a row going up or down, or {SPC.shiftRun} in a row on one side of
            CL is <strong>Check soon</strong>. The UCL/LCL formula is the standard individuals (I-MR) chart, a placeholder until the QA team's formula is added (<Code>src/lib/spc.js</Code>).
          </p>
        </section>
      </div>

      <section className="card flush">
        <div className="card-head padded">
          <h2>All sensors</h2>
          <span className="muted small">Select a row to see its chart</span>
        </div>
        <DataTable
          label="All sensors"
          columns={columns}
          rows={all}
          rowKey={(x) => x.key}
          activeKey={sel.key}
          onOpen={(x) => set({ unit: x.d.id, sensor: x.sid })}
          defaultSort={{ key: "status", dir: "asc" }}
          rowClass={(x) => `row-${x.cc.status}`}
        />
      </section>
    </div>
  );
}
