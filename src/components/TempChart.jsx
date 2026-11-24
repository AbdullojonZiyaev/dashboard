import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LIMITS } from "../config.js";
import { outOfRange } from "../lib/alerts.js";
import { fmtDateTime, fmtNum, fmtTime } from "../lib/format.js";

// Series colors never reuse the status colors (DESIGN.md §3.1)
export const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];

// Periods where any series is outside the safe range, for highlighting
function outsidePeriods(data, keys) {
  const out = [];
  let start = null;
  let last = null;
  for (const p of data) {
    const bad = keys.some((k) => Number.isFinite(p[k]) && outOfRange(p[k]));
    if (bad && start === null) start = p.ts;
    if (!bad && start !== null) {
      out.push([start, p.ts]);
      start = null;
    }
    last = p.ts;
  }
  if (start !== null) out.push([start, last]);
  return out;
}

// Simple lines, shaded safe range, time outside it highlighted, exact value on hover,
// and "Show as table" under every chart (DESIGN.md §6, §10).
export default function TempChart({ title, data, series, from, to, unit = "°C", limits = false, doorPeriods = [], height = 240 }) {
  const [asTable, setAsTable] = useState(false);
  const keys = series.map((s) => s.key);
  const values = data.flatMap((p) => keys.map((k) => p[k]).filter(Number.isFinite));
  let domain = ["auto", "auto"];
  if (limits) {
    domain = values.length
      ? [Math.floor(Math.min(...values, LIMITS.tempMinC) - 1), Math.ceil(Math.max(...values, LIMITS.tempMaxC) + 1)]
      : [LIMITS.tempMinC - 1, LIMITS.tempMaxC + 1];
  }
  const outside = limits ? outsidePeriods(data, keys) : [];
  const step = Math.max(1, Math.ceil(data.length / 60));
  const rows = data.filter((_, i) => i % step === 0 || i === data.length - 1).reverse();

  return (
    <figure className="chart">
      {title && <figcaption>{title}</figcaption>}
      {asTable ? (
        <div className="table-wrap chart-table">
          <table className="dtable compact">
            <thead>
              <tr>
                <th>Time</th>
                {series.map((s) => (
                  <th key={s.key} className="num">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.ts}>
                  <td>{fmtDateTime(p.ts)}</td>
                  {keys.map((k) => (
                    <td key={k} className={`num ${limits && Number.isFinite(p[k]) && outOfRange(p[k]) ? "tone-bad" : ""}`}>
                      {fmtNum(p[k], 1, ` ${unit}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {step > 1 && <p className="muted small">Showing every {step}th reading. The Excel export has all of them.</p>}
        </div>
      ) : data.length === 0 ? (
        <div className="chart-empty muted" style={{ height }}>
          No readings in this period.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -14 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="ts" type="number" domain={[from, to]} allowDataOverflow tickFormatter={fmtTime} tick={{ fill: "var(--text-2)", fontSize: 12 }} stroke="var(--border)" />
            <YAxis domain={domain} tick={{ fill: "var(--text-2)", fontSize: 12 }} stroke="var(--border)" />
            {limits && <ReferenceArea y1={LIMITS.tempMinC} y2={LIMITS.tempMaxC} fill="var(--safe-band)" fillOpacity={1} stroke="none" ifOverflow="hidden" />}
            {doorPeriods.map(([a, b]) => (
              <ReferenceArea key={`d${a}`} x1={Math.max(a, from)} x2={Math.min(b, to)} fill="var(--door-band)" fillOpacity={1} ifOverflow="hidden" />
            ))}
            {outside.map(([a, b]) => (
              <ReferenceArea key={`o${a}`} x1={a} x2={Math.max(b, a + 30)} fill="var(--problem-band)" fillOpacity={1} ifOverflow="hidden" />
            ))}
            <Tooltip
              labelFormatter={(ts) => fmtDateTime(ts)}
              formatter={(v, name) => [`${Number(v).toFixed(1)} ${unit}`, name]}
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--text)" }}
            />
            {series.map((s) => (
              <Line key={s.key} dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
      <div className="chart-foot">
        <span className="muted small chart-key">
          {limits && (
            <>
              <i className="key key-safe" /> Safe range {LIMITS.tempMinC}–{LIMITS.tempMaxC} °C
              <i className="key key-problem" /> Outside the range
            </>
          )}
          {doorPeriods.length > 0 && (
            <>
              <i className="key key-door" /> Door open
            </>
          )}
          {series.length > 1 &&
            series.map((s) => (
              <span key={s.key} className="key-series">
                <i className="key" style={{ background: s.color }} /> {s.name}
              </span>
            ))}
        </span>
        <button className="link" onClick={() => setAsTable((v) => !v)}>
          {asTable ? "Show as chart" : "Show as table"}
        </button>
      </div>
    </figure>
  );
}
