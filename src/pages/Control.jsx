import { deviceInfo } from "../data/registry.js";
import { sensorLabel } from "../lib/alerts.js";
import { STATUS } from "../lib/describe.js";
import { fmtDateTime, fmtNum, fmtSpan, fmtTime } from "../lib/format.js";
import { setParams } from "../lib/router.js";
import { useState } from "react";
import { BACKEND, BACKEND_SENSOR, LIVE_SPEC_DEFAULT, useBackendHistory, useLiveSpec } from "../lib/backend.js";
import { SAMPLE_OPTIONS, SPC, controlChart, spec } from "../lib/spc.js";
import { Code, StatusBadge, StatusIcon } from "../components/Badges.jsx";
import ControlChart from "../components/ControlChart.jsx";
import DataTable from "../components/DataTable.jsx";
import { RANGES } from "../components/UnitDetail.jsx";
import { EmptyState, Segmented, Skeleton } from "../components/UI.jsx";

const RANK = { critical: 0, warning: 1, offline: 2, ok: 3 };
const sensorsOf = (d) => Object.keys(d.sensors).filter((id) => d.history.some((p) => p[`t:${id}`] !== undefined));

const PERIODS = [...RANGES.map((r) => [String(r.s), r.label]), ["all", "All time"]];
const SOURCES = [
  ["current", "Current backend (live)"],
  ["best", "Best case (simulated)"],
];

// Units and sensors to chart, from either source, in one shape:
// { id, name, device: { history }, sensors: [{ id, label, code }] }
function simulatedUnits(ctx) {
  return ctx.deviceList.map((d) => ({ id: d.id, name: deviceInfo(d.id).name, device: d, sensors: sensorsOf(d).map((sid) => ({ id: sid, label: sensorLabel(d, sid), code: sid })) }));
}
function backendUnits(devices) {
  return devices.map((d) => ({ id: d.id, name: d.id, device: d, sensors: [{ id: BACKEND_SENSOR, label: "Sensor", code: null }] }));
}

// Temperature control chart per location and sensor (requested by the QA team).
// Data from the live backend (current format) or the simulated full messages (best case).
export default function Control({ ctx }) {
  const { route } = ctx;
  const p = route.params;
  const source = p.src === "best" ? "best" : "current";
  const set = (patch) => setParams(route, patch);
  // Live data is often sparse, so it opens on "All time"; the simulation on 1 h
  const defaultRange = source === "current" ? "all" : String(RANGES[0].s);
  const rangeKey = PERIODS.some(([k]) => k === p.range) ? p.range : defaultRange;
  const rangeS = rangeKey === "all" ? Infinity : Number(rangeKey);
  const backend = useBackendHistory(source === "current", Math.max(SPC.baselineS, rangeS));
  const [liveSpec, setLiveSpec] = useLiveSpec();
  const specLimits = source === "current" ? liveSpec : spec();
  const sampleS = Number(p.every) || SAMPLE_OPTIONS[1].s;
  // The backend stamps readings with the real time; the simulation has its own clock
  const now = source === "current" ? Date.now() / 1000 : ctx.now;

  const sourcePicker = (
    <div className="picker">
      <span className="picker-label">Data</span>
      <Segmented label="Data source" options={SOURCES} value={source} onChange={(v) => set({ src: v === "current" ? null : v, unit: null, sensor: null, range: null })} />
    </div>
  );
  const periodPicker = (
    <div className="picker">
      <span className="picker-label">Period</span>
      <Segmented label="Period" options={PERIODS} value={rangeKey} onChange={(v) => set({ range: v === defaultRange ? null : v })} />
    </div>
  );
  const head = (sub) => (
    <div className="page-head">
      <div>
        <h1>Temperature control chart</h1>
        {sub}
      </div>
    </div>
  );

  if (source === "current" && backend.status !== "live") {
    return (
      <div className="page control">
        {head(null)}
        <div className="detail-pickers">{sourcePicker}</div>
        {backend.status === "checking" ? (
          <Skeleton tiles={4} rows={6} />
        ) : (
          <div className="notice notice-warning">
            <StatusIcon status="warning" />
            <span>
              <strong>Can't reach the backend</strong> at <Code>{BACKEND}</Code> ({backend.error}). Start it, or switch to <strong>Best case</strong> to see the chart with simulated data. This page checks again every 10 s.
            </span>
          </div>
        )}
      </div>
    );
  }
  if (source === "best" && !ctx.ready) return <Skeleton tiles={4} rows={8} />;

  const units = source === "current" ? backendUnits(backend.devices) : simulatedUnits(ctx);
  const all = units.flatMap((u) => u.sensors.map((sn) => ({ u, sn, key: `${u.id}|${sn.id}`, cc: controlChart(u.device, sn.id, now, rangeS, sampleS, specLimits) })));
  if (!all.length) {
    return (
      <div className="page control">
        {head(null)}
        <div className="detail-pickers">
          {sourcePicker}
          {periodPicker}
        </div>
        <EmptyState>
          {source === "current"
            ? "The backend is running but has no readings in this period. Choose All time, or wait for a sensor to post to /api/readings."
            : "No sensor has sent temperature readings yet."}
        </EmptyState>
      </div>
    );
  }
  const worst = all.slice().sort((a, b) => RANK[a.cc.status] - RANK[b.cc.status])[0];
  const sel = all.find((x) => x.u.id === p.unit && x.sn.id === p.sensor) ?? all.find((x) => x.u.id === p.unit) ?? worst;
  const { u, sn, cc } = sel;
  const last = cc.points[cc.points.length - 1];
  // All time: the axis fits the data (live data may be days old); otherwise it ends now
  const first = cc.points[0];
  const chartTo = Number.isFinite(rangeS) ? now : (last?.ts ?? now);
  const chartFrom = Number.isFinite(rangeS) ? now - rangeS : Math.min(first?.ts ?? chartTo - 3600, chartTo - 600);
  // Times older than today get their date
  const when = (ts) => (now - ts > 20 * 3600 ? fmtDateTime(ts) : fmtTime(ts));
  const status = STATUS[cc.status];

  const columns = [
    { key: "loc", label: "Location", render: (x) => x.u.name, sort: (x) => x.u.name },
    { key: "sensor", label: "Sensor", render: (x) => <span>{x.sn.label} {x.sn.code && <span className="muted small">{x.sn.code}</span>}</span> },
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
            {u.name} · {sn.label} {sn.code && <Code>{sn.code}</Code>} · {source === "current" ? "live from the backend" : "simulated full-format data"}
          </p>
        </div>
        <StatusBadge status={status} size="lg" />
      </div>

      <div className="detail-pickers">
        {sourcePicker}
        <label className="picker">
          <span className="picker-label">Location</span>
          <select value={u.id} onChange={(e) => set({ unit: e.target.value, sensor: null })}>
            {units.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label className="picker">
          <span className="picker-label">Sensor</span>
          <select value={sn.id} onChange={(e) => set({ unit: u.id, sensor: e.target.value })} disabled={u.sensors.length < 2}>
            {u.sensors.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
                {x.code ? ` · ${x.code}` : ""}
              </option>
            ))}
          </select>
        </label>
        {periodPicker}
        <div className="picker">
          <span className="picker-label">One reading every</span>
          <Segmented label="Reading interval" options={SAMPLE_OPTIONS.map((o) => [o.s, o.label])} value={sampleS} onChange={(v) => set({ every: v === SAMPLE_OPTIONS[1].s ? null : v })} />
        </div>
      </div>

      <div className="stats-row">
        <div className={`stat ${last && last.flags.includes("spec") ? "stat-bad" : last?.flags.length ? "stat-warn" : ""}`}>
          <span className="stat-label">Latest reading</span>
          <span className="stat-value stat-big">{fmtNum(last?.v, 1, "°C")}</span>
          <span className="muted small">{last ? when(last.ts) : "no data"}</span>
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
        {source === "current" ? (
          <SpecEditor value={liveSpec} onChange={setLiveSpec} />
        ) : (
          <div className="stat">
            <span className="stat-label">Specification limits (LSL – USL)</span>
            <span className="stat-value stat-big">
              {cc.spec.lsl.toFixed(1)} – {cc.spec.usl.toFixed(1)}°C
            </span>
            <span className="muted small">fixed food-safety requirement</span>
          </div>
        )}
      </div>

      {source === "current" && (
        <p className="muted small">
          The current backend format stores one temperature per device, timed when the server received it. Readings sent late after a network drop are plotted at the wrong time.
          {backend.truncated && ` Only the newest 5000 readings are used (since ${fmtDateTime(backend.oldest)}).`}
        </p>
      )}
      <section className="card">
        <ControlChart points={cc.points} limits={cc.limits} spec={cc.spec} events={cc.events} from={chartFrom} to={chartTo} />
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
                      {when(e.ts)} · {e.rule === "trend" || e.rule === "shift" ? e.detail : `${e.v.toFixed(1)}°C · ${e.detail}`}
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
              <dd>
                {source === "current"
                  ? `Set on this page for the live sensor: ${cc.spec.lsl}–${cc.spec.usl} °C. Not calculated.`
                  : `Fixed food-safety limits (${cc.spec.lsl}–${cc.spec.usl} °C). Change them in the safety-limit settings.`}
              </dd>
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
          onOpen={(x) => set({ unit: x.u.id, sensor: x.sn.id })}
          defaultSort={{ key: "status", dir: "asc" }}
          rowClass={(x) => `row-${x.cc.status}`}
        />
      </section>
    </div>
  );
}

// USL / LSL for the live sensor: typed in, applied when both are numbers and LSL < USL
function SpecEditor({ value, onChange }) {
  const [draft, setDraft] = useState({ lsl: String(value.lsl), usl: String(value.usl) });
  const lsl = Number.parseFloat(draft.lsl);
  const usl = Number.parseFloat(draft.usl);
  const valid = Number.isFinite(lsl) && Number.isFinite(usl) && lsl < usl;
  const edit = (k) => (e) => {
    const next = { ...draft, [k]: e.target.value };
    setDraft(next);
    const l = Number.parseFloat(next.lsl);
    const u = Number.parseFloat(next.usl);
    if (Number.isFinite(l) && Number.isFinite(u) && l < u) onChange({ lsl: l, usl: u });
  };
  const reset = () => {
    setDraft({ lsl: String(LIVE_SPEC_DEFAULT.lsl), usl: String(LIVE_SPEC_DEFAULT.usl) });
    onChange(LIVE_SPEC_DEFAULT);
  };
  return (
    <div className={`stat ${valid ? "" : "stat-bad"}`}>
      <span className="stat-label">Specification limits (LSL – USL)</span>
      <span className="spec-edit">
        <input type="number" step="0.5" inputMode="decimal" aria-label="LSL in °C" value={draft.lsl} onChange={edit("lsl")} />
        <span>–</span>
        <input type="number" step="0.5" inputMode="decimal" aria-label="USL in °C" value={draft.usl} onChange={edit("usl")} />
        <span>°C</span>
      </span>
      <span className="muted small">
        {valid ? "set for the live sensor · " : "LSL must be lower than USL · "}
        <button className="link" onClick={reset}>
          Reset to {LIVE_SPEC_DEFAULT.lsl}–{LIVE_SPEC_DEFAULT.usl} °C
        </button>
      </span>
    </div>
  );
}
