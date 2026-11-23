// Statistics over a time window, used by the detail view, the KPI tiles, the
// exports and the assistant.

import { LIMITS } from "../config.js";
import { doorOpenPeriods } from "../data/store.js";

const inRange = (t) => t >= LIMITS.tempMinC && t <= LIMITS.tempMaxC;

// Per-sensor statistics for one device between `from` and `now`.
export function sensorStats(d, sensorId, from, now) {
  const tKey = `t:${sensorId}`;
  const rhKey = `rh:${sensorId}`;
  const pts = d.history.filter((p) => p.ts >= from && p.ts <= now && Number.isFinite(p[tKey]));
  if (pts.length === 0) return null;
  const temps = pts.map((p) => p[tKey]);
  const rhs = pts.map((p) => p[rhKey]).filter(Number.isFinite);
  const inside = temps.filter(inRange).length;

  // Excursions: runs of consecutive out-of-range readings
  let excursions = 0;
  let outside = false;
  let outsideS = 0;
  for (let i = 0; i < pts.length; i++) {
    const bad = !inRange(temps[i]);
    if (bad && !outside) excursions++;
    if (bad) outsideS += i + 1 < pts.length ? Math.min(pts[i + 1].ts - pts[i].ts, d.intervalS * 3) : d.intervalS;
    outside = bad;
  }

  return {
    sensorId,
    count: pts.length,
    min: Math.min(...temps),
    max: Math.max(...temps),
    avg: temps.reduce((a, b) => a + b, 0) / temps.length,
    rhMin: rhs.length ? Math.min(...rhs) : null,
    rhMax: rhs.length ? Math.max(...rhs) : null,
    rhAvg: rhs.length ? rhs.reduce((a, b) => a + b, 0) / rhs.length : null,
    inRangePct: (inside / temps.length) * 100,
    excursions,
    outsideS,
  };
}

export function deviceStats(d, from, now) {
  const sensors = Object.keys(d.sensors)
    .map((id) => sensorStats(d, id, from, now))
    .filter(Boolean);
  const openings = d.doorEvents.filter((e) => e.state === "open" && e.ts >= from && e.ts <= now).length;
  const openS = d.door
    ? doorOpenPeriods(d, now)
        .map(([a, b]) => Math.max(0, Math.min(b, now) - Math.max(a, from)))
        .reduce((x, y) => x + y, 0)
    : null;
  const all = sensors.length
    ? {
        min: Math.min(...sensors.map((s) => s.min)),
        max: Math.max(...sensors.map((s) => s.max)),
        avg: sensors.reduce((a, s) => a + s.avg * s.count, 0) / sensors.reduce((a, s) => a + s.count, 0),
        inRangePct: sensors.reduce((a, s) => a + s.inRangePct * s.count, 0) / sensors.reduce((a, s) => a + s.count, 0),
        excursions: sensors.reduce((a, s) => a + s.excursions, 0),
      }
    : null;
  return { sensors, all, doorOpenings: d.door ? openings : null, doorOpenS: openS };
}

// Fleet-wide numbers for the KPI tiles.
export function fleetStats(devices, from, now) {
  const per = devices.map((d) => ({ d, s: deviceStats(d, from, now) }));
  const withData = per.filter((x) => x.s.all);
  const total = withData.reduce((a, x) => a + x.s.sensors.reduce((b, s) => b + s.count, 0), 0);
  const current = devices.flatMap((d) => Object.values(d.sensors).map((s) => s.temp_c)).filter(Number.isFinite);
  const batteries = devices.filter((d) => d.power?.source === "battery").map((d) => ({ d, pct: d.power.battery_pct }));
  return {
    inRangePct: total ? withData.reduce((a, x) => a + x.s.sensors.reduce((b, s) => b + s.inRangePct * s.count, 0), 0) / total : null,
    avgNow: current.length ? current.reduce((a, b) => a + b, 0) / current.length : null,
    minNow: current.length ? Math.min(...current) : null,
    maxNow: current.length ? Math.max(...current) : null,
    doorOpenings: per.reduce((a, x) => a + (x.s.doorOpenings ?? 0), 0),
    lowestBattery: batteries.sort((a, b) => a.pct - b.pct)[0] ?? null,
    sensorCount: devices.reduce((a, d) => a + Object.keys(d.sensors).length, 0),
  };
}
