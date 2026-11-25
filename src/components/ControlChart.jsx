import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtDateTime, fmtNum, fmtTime } from "../lib/format.js";

const MARGIN = { top: 12, right: 112, bottom: 0, left: -14 };
const X_AXIS_H = 30;
const RULE_WORD = { spec: "Outside spec limit", control: "Outside control limit", trend: "Part of a trend", shift: "Part of a shift" };

// Pill label at the right end of a limit line. The y position is worked out
// beforehand so labels of lines that are close together don't overlap.
function EdgeLabel({ viewBox, text, color, labelY: y, dashed }) {
  if (!viewBox) return null;
  const x = viewBox.x + viewBox.width + 8;
  const w = text.length * 6.6 + 16;
  return (
    <g>
      {Math.abs(y - viewBox.y) > 1 && <line x1={viewBox.x + viewBox.width} y1={viewBox.y} x2={x} y2={y} stroke={color} strokeWidth={1} strokeDasharray={dashed ? "3 3" : undefined} />}
      <rect x={x} y={y - 10} width={w} height={20} rx={6} fill="var(--card)" stroke={color} strokeWidth={1.5} />
      <text x={x + w / 2} y={y + 4} textAnchor="middle" fontSize={12} fontWeight={650} fill={color}>
        {text}
      </text>
    </g>
  );
}

// Spreads label positions so each is at least `gap` px from the next
function spread(items, gap) {
  const sorted = items.slice().sort((a, b) => a.py - b.py);
  for (let i = 1; i < sorted.length; i++) if (sorted[i].py - sorted[i - 1].py < gap) sorted[i].py = sorted[i - 1].py + gap;
  return items;
}

const dotColor = (flags) => (flags.includes("spec") ? "var(--bad)" : flags.length ? "var(--warn)" : "var(--series-1)");

// Control chart in the style the QA team asked for: readings, centre line (CL),
// control limits (UCL / LCL, calculated) and specification limits (USL / LSL, fixed).
export default function ControlChart({ points, limits, spec, events, from, to, height = 360 }) {
  const [asTable, setAsTable] = useState(false);
  const values = points.map((p) => p.v);
  const lines = [values, spec.usl, spec.lsl, limits ? [limits.ucl, limits.lcl] : []].flat();
  const lo = Math.floor(Math.min(...lines) - 0.5);
  const hi = Math.ceil(Math.max(...lines) + 0.5);
  const plotH = height - MARGIN.top - MARGIN.bottom - X_AXIS_H;
  const py = (v) => MARGIN.top + ((hi - v) / (hi - lo)) * plotH;

  const refs = spread(
    [
      { key: "usl", v: spec.usl, text: `USL = ${spec.usl.toFixed(1)}°C`, color: "var(--bad)" },
      limits && { key: "ucl", v: limits.ucl, text: `UCL = ${limits.ucl.toFixed(1)}°C`, color: "var(--warn)", dashed: true },
      limits && { key: "cl", v: limits.cl, text: `CL = ${limits.cl.toFixed(1)}°C`, color: "var(--ok)" },
      limits && { key: "lcl", v: limits.lcl, text: `LCL = ${limits.lcl.toFixed(1)}°C`, color: "var(--warn)", dashed: true },
      { key: "lsl", v: spec.lsl, text: `LSL = ${spec.lsl.toFixed(1)}°C`, color: "var(--bad)" },
    ]
      .filter(Boolean)
      .map((r) => ({ ...r, py: py(r.v) })),
    22,
  );
  const trends = events.filter((e) => e.rule === "trend");
  const showAllDots = points.length <= 120;

  const Dot = ({ cx, cy, payload }) => {
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
    const flagged = payload.flags.length > 0;
    if (!flagged && !showAllDots) return null;
    return <circle cx={cx} cy={cy} r={flagged ? 5 : 3.5} fill={dotColor(payload.flags)} stroke="var(--card)" strokeWidth={1.5} />;
  };

  return (
    <figure className="chart cchart">
      {asTable ? (
        <div className="table-wrap chart-table">
          <table className="dtable compact">
            <thead>
              <tr>
                <th>Reading time</th>
                <th className="num">Temperature</th>
                <th>Rules</th>
              </tr>
            </thead>
            <tbody>
              {points
                .slice()
                .reverse()
                .map((p) => (
                  <tr key={p.ts}>
                    <td>{fmtDateTime(p.ts)}</td>
                    <td className={`num ${p.flags.includes("spec") ? "tone-bad" : p.flags.length ? "tone-warn" : ""}`}>{fmtNum(p.v, 2, " °C")}</td>
                    <td className="muted small">{p.flags.map((f) => RULE_WORD[f]).join(" · ") || "–"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : points.length === 0 ? (
        <div className="chart-empty muted" style={{ height }}>
          No readings from this sensor in this period.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={points} margin={MARGIN}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="ts" type="number" domain={[from, to]} allowDataOverflow tickFormatter={to - from > 20 * 3600 ? fmtDateTime : fmtTime} tick={{ fill: "var(--text-2)", fontSize: 12 }} stroke="var(--border)" height={X_AXIS_H} />
            <YAxis domain={[lo, hi]} allowDataOverflow tick={{ fill: "var(--text-2)", fontSize: 12 }} stroke="var(--border)" unit="°" />
            {/* Zones: outside the spec limits is unsafe; between the control limits is normal */}
            <ReferenceArea y1={spec.usl} y2={hi} fill="var(--bad-tint)" fillOpacity={1} stroke="none" ifOverflow="hidden" />
            {spec.lsl > lo && <ReferenceArea y1={lo} y2={spec.lsl} fill="var(--bad-tint)" fillOpacity={1} stroke="none" ifOverflow="hidden" />}
            {limits && <ReferenceArea y1={Math.max(limits.lcl, spec.lsl)} y2={Math.min(limits.ucl, spec.usl)} fill="var(--ok-tint)" fillOpacity={0.7} stroke="none" ifOverflow="hidden" />}
            {trends.map((e) => (
              <ReferenceArea key={`tr${e.ts}`} x1={e.from} x2={e.ts} fill="var(--warn-tint)" fillOpacity={0.55} stroke="var(--warn)" strokeDasharray="4 3" ifOverflow="hidden" />
            ))}
            {refs.map((r) => (
              <ReferenceLine
                key={r.key}
                y={r.v}
                stroke={r.color}
                strokeWidth={r.key === "cl" ? 2 : r.dashed ? 1.5 : 2}
                strokeDasharray={r.dashed ? "6 4" : undefined}
                ifOverflow="hidden"
                label={<EdgeLabel text={r.text} color={r.color} labelY={r.py} dashed={r.dashed} />}
              />
            ))}
            <Tooltip
              labelFormatter={(ts) => fmtDateTime(ts)}
              formatter={(v, _n, item) => [`${Number(v).toFixed(2)} °C${item.payload.flags.length ? ` · ${item.payload.flags.map((f) => RULE_WORD[f]).join(", ")}` : ""}`, "Reading"]}
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--text)" }}
            />
            <Line dataKey="v" name="Sensor reading" stroke="var(--series-1)" strokeWidth={2} dot={<Dot />} activeDot={{ r: 6 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
      <div className="chart-foot">
        <span className="muted small chart-key">
          <span className="key-series">
            <i className="key key-dot" style={{ background: "var(--series-1)" }} /> Sensor reading
          </span>
          <span className="key-series">
            <i className="key key-line" style={{ background: "var(--ok)" }} /> Centre line (CL)
          </span>
          <span className="key-series">
            <i className="key key-line key-dash" style={{ color: "var(--warn)" }} /> Control limits (UCL / LCL)
          </span>
          <span className="key-series">
            <i className="key key-line" style={{ background: "var(--bad)" }} /> Specification limits (USL / LSL)
          </span>
          {trends.length > 0 && (
            <span className="key-series">
              <i className="key" style={{ background: "var(--warn-tint)", outline: "1px dashed var(--warn)" }} /> Trend
            </span>
          )}
        </span>
        <button className="link" onClick={() => setAsTable((v) => !v)}>
          {asTable ? "Show as chart" : "Show as table"}
        </button>
      </div>
    </figure>
  );
}
