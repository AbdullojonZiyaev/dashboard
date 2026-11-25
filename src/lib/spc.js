// Statistical process control (SPC) for the temperature control chart.
//
// USL / LSL: the fixed food-safety limits (config.js LIMITS), not calculated.
// UCL / CL / LCL: calculated from the sensor's own readings.
//
// PLACEHOLDER FORMULA: until the QA team sends theirs, the limits use the standard
// individuals (I-MR) chart:
//   CL  = mean of the baseline readings
//   MR̄  = mean of |xᵢ − xᵢ₋₁| (moving range of two consecutive readings)
//   σ̂   = MR̄ / d₂, with d₂ = 1.128 for ranges of two
//   UCL = CL + 3σ̂,  LCL = CL − 3σ̂
// To use another formula, change controlLimits() only; the chart and the rules read its result.

import { LIMITS } from "../config.js";

export const SPC = {
  baselineS: 12 * 3600, // limits are calculated from this much history
  minPoints: 8, // fewer readings than this: no limits
  sigmas: 3,
  d2: 1.128,
  trendRun: 6, // this many readings in a row going up (or down) is a trend
  shiftRun: 8, // this many readings in a row on one side of CL is a shift
};

export const SAMPLE_OPTIONS = [
  { label: "1 min", s: 60 },
  { label: "5 min", s: 300 },
  { label: "15 min", s: 900 },
];

export const spec = () => ({ usl: LIMITS.tempMaxC, lsl: LIMITS.tempMinC });

// One reading per interval (the last valid one in each interval), oldest first
export function sampleSeries(history, key, from, to, stepS) {
  const out = [];
  let bucket = null;
  let last = null;
  for (const p of history) {
    if (p.ts < from || p.ts > to || !Number.isFinite(p[key])) continue;
    const b = Math.floor(p.ts / stepS);
    if (b !== bucket && last) out.push(last);
    bucket = b;
    last = { ts: p.ts, v: p[key] };
  }
  if (last) out.push(last);
  return out;
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

// UCL, CL, LCL from a list of readings (see the note at the top)
export function controlLimits(values) {
  if (values.length < SPC.minPoints) return null;
  const cl = mean(values);
  const mrs = values.slice(1).map((v, i) => Math.abs(v - values[i]));
  const mrBar = mean(mrs);
  const sigma = mrBar / SPC.d2;
  return {
    method: "I-MR (placeholder)",
    n: values.length,
    cl,
    mrBar,
    sigma,
    ucl: cl + SPC.sigmas * sigma,
    lcl: cl - SPC.sigmas * sigma,
  };
}

// Checks every reading against the rules. Returns the readings with flags,
// the events (when each problem started, newest first) and the status now.
export function evaluate(points, limits, { usl, lsl } = spec()) {
  const out = points.map((p) => ({ ...p, flags: [] }));
  const events = [];
  const add = (p, ev) => events.push({ ts: p.ts, v: p.v, ...ev });

  let up = 1;
  let down = 1;
  let side = 0;
  let sideRun = 0;
  for (let i = 0; i < out.length; i++) {
    const p = out[i];
    const prev = out[i - 1];

    // 1. Outside the food-safety limits: act now
    if (p.v > usl || p.v < lsl) {
      p.flags.push("spec");
      if (!prev?.flags.includes("spec")) add(p, { rule: "spec", severity: "critical", title: p.v > usl ? "Upper specification limit exceeded" : "Lower specification limit exceeded", detail: "QA verification required" });
    }
    if (!limits) continue;

    // 2. Outside the control limits: the process changed, check soon
    if (p.v > limits.ucl || p.v < limits.lcl) {
      p.flags.push("control");
      if (!prev?.flags.includes("control")) add(p, { rule: "control", severity: "warning", title: p.v > limits.ucl ? "Upper control limit exceeded" : "Lower control limit exceeded", detail: "Unusual for this sensor" });
    }

    // 3. Trend: readings going steadily up (or down)
    up = prev && p.v > prev.v ? up + 1 : 1;
    down = prev && p.v < prev.v ? down + 1 : 1;
    if (up >= SPC.trendRun || down >= SPC.trendRun) {
      const run = up >= SPC.trendRun ? up : down;
      for (let k = i - run + 1; k <= i; k++) if (!out[k].flags.includes("trend")) out[k].flags.push("trend");
      if (run === SPC.trendRun)
        add(p, { rule: "trend", severity: "warning", title: up >= SPC.trendRun ? "Increasing temperature trend" : "Decreasing temperature trend", detail: `${SPC.trendRun} consecutive ${up >= SPC.trendRun ? "increasing" : "decreasing"} readings`, from: out[i - run + 1].ts });
    }

    // 4. Shift: many readings in a row on one side of the centre line
    const s = Math.sign(p.v - limits.cl);
    sideRun = s !== 0 && s === side ? sideRun + 1 : s !== 0 ? 1 : 0;
    side = s;
    if (sideRun >= SPC.shiftRun) {
      for (let k = i - sideRun + 1; k <= i; k++) if (!out[k].flags.includes("shift")) out[k].flags.push("shift");
      if (sideRun === SPC.shiftRun)
        add(p, { rule: "shift", severity: "warning", title: s > 0 ? "Running warmer than usual" : "Running colder than usual", detail: `${SPC.shiftRun} readings in a row ${s > 0 ? "above" : "below"} the centre line`, from: out[i - sideRun + 1].ts });
    }
  }

  const last = out[out.length - 1];
  const status = !last ? "offline" : last.flags.includes("spec") ? "critical" : last.flags.length ? "warning" : "ok";
  return { points: out, events: events.reverse(), status };
}

// Everything the chart needs for one sensor
export function controlChart(device, sensorId, now, rangeS, sampleS) {
  const key = `t:${sensorId}`;
  const baseline = sampleSeries(device.history, key, now - SPC.baselineS, now, sampleS);
  const limits = controlLimits(baseline.map((p) => p.v));
  const shown = sampleSeries(device.history, key, now - rangeS, now, sampleS);
  return { limits, spec: spec(), baselineFrom: baseline[0]?.ts ?? null, ...evaluate(shown, limits) };
}
