// Simulated meal batches and flights for the prototype.
// In the real system these come from the backend (batch registration, packing scans
// and flight loading lists). Here they are generated from a fixed schedule, relative
// to the moment the dashboard opens (T), and linked to the simulated sensor units so
// each batch's temperature comes from the trolley, truck or cold room it is in.
//
// Every 75 minutes a flight departs. Each batch goes through:
//   Produced (kitchen)            D − 8 h
//   Entered cold storage          +35 min       Cold Room 2
//   Packed on trolley             D − 3 h       one of the three trolleys
//   Loaded on truck               D − 100 min   Truck T-07 or T-11
//   Loaded on aircraft            D − 40 min    trolley on board
//   Departed                      D
//
// Built-in scenarios:
//   flight 0 (FL 203, T+70 min) is on Truck T-07 when its rear sensor starts warming up
//   flight 1 (FL 117) has one batch packed 70 minutes late
//   one batch missed its flight and expired in Cold Room 2 at T−20 min

import { LIMITS } from "../config.js";
import { deviceInfo } from "./registry.js";
import { isOffline, outOfRange } from "../lib/alerts.js";
import { STATUS } from "../lib/describe.js";
import { fmtSpan, fmtTime, fmtUntil, plural } from "../lib/format.js";

const MIN = 60;
const H = 3600;
const ROOM = "esp32s3-9a8b7c6d5e4f";
const TROLLEYS = ["esp32s3-a1b2c3d4e5f6", "esp32s3-1c2d3e4f5a6b", "esp32s3-6b5a4f3e2d1c"];
const TRUCKS = ["esp32s3-0f1e2d3c4b5a", "esp32s3-a9b8c7d6e5f4"];
export const EXPIRY_SOON_S = 6 * H;
export const PACK_BY_S = 3 * H; // batches should be on a trolley this long before departure

export const STAGES = [
  { key: "kitchen", label: "Kitchen" },
  { key: "storage", label: "Cold storage" },
  { key: "truck", label: "Truck" },
  { key: "aircraft", label: "Aircraft" },
];

const MEALS = [
  { name: "Chicken biryani", shelfH: 48 },
  { name: "Vegetable lasagne", shelfH: 48 },
  { name: "Fruit salad", shelfH: 10 },
  { name: "Beef stroganoff", shelfH: 48 },
  { name: "Paneer tikka masala", shelfH: 48 },
  { name: "Grilled salmon & rice", shelfH: 36 },
  { name: "Chicken caesar wrap", shelfH: 20 },
  { name: "Lamb machboos", shelfH: 48 },
  { name: "Mushroom risotto", shelfH: 36 },
  { name: "Hummus & mezze plate", shelfH: 24 },
];
const FLIGHT_NOS = ["FL 087", "FL 095", "FL 112", "FL 203", "FL 117", "FL 245", "FL 310", "FL 322", "FL 408", "FL 415", "FL 502", "FL 517", "FL 603", "FL 611", "FL 704", "FL 719", "FL 801", "FL 815"];
const DESTS = ["London", "Mumbai", "Paris", "Riyadh", "Cairo", "Karachi", "Nairobi", "Istanbul", "Colombo", "Muscat", "Manila", "Athens"];
const STANDS = ["B12", "C04", "B07", "A03", "C11", "B02", "A09", "C06"];
const FIRST_K = -3;
const LAST_K = FIRST_K + FLIGHT_NOS.length - 1;

export function createMealPlan(T) {
  const d = new Date(T * 1000);
  const prefix = `B-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}`;
  const base = T + 70 * MIN;
  const flights = [];
  const batches = [];
  let n = 380;

  for (let k = FIRST_K; k <= LAST_K; k++) {
    const i = k - FIRST_K;
    const D = base + k * 75 * MIN;
    const trolley = TROLLEYS[((k % 3) + 3) % 3];
    const truck = TRUCKS[((k % 2) + 2) % 2];
    const flight = { no: FLIGHT_NOS[i], dest: DESTS[i % DESTS.length], departs: D, stand: STANDS[i % STANDS.length], trolley, truck, codes: [] };
    flights.push(flight);

    const count = 2 + ((i * 7) % 3);
    for (let j = 0; j < count; j++) {
      const meal = MEALS[(i * 3 + j * 4) % MEALS.length];
      const produced = D - 8 * H + j * 12 * MIN;
      const packed = k === 1 && j === 0 ? D - 110 * MIN : D - PACK_BY_S + j * 3 * MIN;
      const code = `${prefix}-${String(n++).padStart(4, "0")}`;
      flight.codes.push(code);
      batches.push({
        code,
        meal: meal.name,
        qty: 40 + (((i * 31 + j * 17) % 12) * 10),
        flightNo: flight.no,
        flightDeparts: D,
        trolleyName: deviceInfo(trolley).name,
        producedAt: produced,
        expiresAt: produced + meal.shelfH * H,
        steps: [
          { key: "produced", stage: "kitchen", label: "Produced", at: produced, place: j % 2 ? "Cold kitchen 1" : "Hot kitchen 2", deviceId: null },
          { key: "storage", stage: "storage", label: "Entered cold storage", at: produced + 35 * MIN, place: deviceInfo(ROOM).name, deviceId: ROOM },
          { key: "trolley", stage: "storage", label: "Packed on trolley", at: packed, place: deviceInfo(trolley).name, deviceId: trolley },
          { key: "truck", stage: "truck", label: "Loaded on truck", at: D - 100 * MIN, place: deviceInfo(truck).name, deviceId: truck },
          { key: "aircraft", stage: "aircraft", label: `Loaded on ${flight.no}`, at: D - 40 * MIN, place: `${deviceInfo(trolley).name} · stand ${flight.stand}`, deviceId: trolley },
          { key: "departed", stage: "departed", label: `${flight.no} departed`, at: D, place: `To ${flight.dest}`, deviceId: null },
        ],
      });
    }
  }

  // A batch that missed its flight and stayed in the cold room past its expiry
  const produced = T - 10 * H - 40 * MIN;
  batches.push({
    code: `${prefix}-0377`,
    meal: "Hummus & mezze plate",
    qty: 60,
    flightNo: null,
    missedFlight: "FL 061",
    producedAt: produced,
    expiresAt: T - 20 * MIN,
    steps: [
      { key: "produced", stage: "kitchen", label: "Produced", at: produced, place: "Cold kitchen 1", deviceId: null },
      { key: "storage", stage: "storage", label: "Entered cold storage", at: produced + 30 * MIN, place: deviceInfo(ROOM).name, deviceId: ROOM },
    ],
  });

  return { flights, batches, byCode: Object.fromEntries(batches.map((b) => [b.code, b])) };
}

// ---------- Temperatures ----------

// The warmest working sensor of a unit (food safety looks at the worst case)
function warmestPoint(p) {
  let max = null;
  for (const k in p) if (k.startsWith("t:") && (max === null || p[k] > max)) max = p[k];
  return max;
}

export function warmestNow(d) {
  if (!d) return null;
  const temps = Object.values(d.sensors)
    .filter((s) => s.crc_ok !== false && (!s.status || s.status === "ok"))
    .map((s) => s.temp_c)
    .filter(Number.isFinite);
  return temps.length ? Math.max(...temps) : null;
}

function readingAt(d, ts) {
  if (!d) return null;
  let best = null;
  for (const p of d.history) {
    if (Math.abs(p.ts - ts) <= 180 && (best === null || Math.abs(p.ts - ts) < Math.abs(best.ts - ts))) best = p;
    if (p.ts > ts + 180) break;
  }
  return best ? warmestPoint(best) : null;
}

// The batch's temperature over its journey: each step uses the unit it was in
export function batchSeries(b, devices, now) {
  const steps = b.steps.filter((s) => s.at <= now);
  const out = [];
  steps.forEach((s, i) => {
    const d = s.deviceId && devices[s.deviceId];
    if (!d) return;
    const end = steps[i + 1]?.at ?? now;
    for (const p of d.history) {
      if (p.ts < s.at) continue;
      if (p.ts > end) break;
      const t = warmestPoint(p);
      if (t !== null) out.push({ ts: p.ts, t, place: s.place });
    }
  });
  return out;
}

// ---------- Live state of a batch ----------

export function batchState(b, devices, alerts, now) {
  const steps = b.steps.filter((s) => s.at <= now);
  if (steps.length === 0) return null; // not produced yet
  const step = steps[steps.length - 1];
  const departed = step.key === "departed";
  const d = step.deviceId ? devices[step.deviceId] : null;
  const temp = warmestNow(d);
  const problems = [];
  let status = STATUS.ok;
  const raise = (s) => {
    const order = ["ok", "warning", "offline", "critical"];
    if (order.indexOf(s.key) > order.indexOf(status.key)) status = s;
  };

  if (!departed) {
    if (now >= b.expiresAt) {
      raise(STATUS.critical);
      problems.push({ severity: "critical", text: `Expired ${fmtSpan(now - b.expiresAt)} ago`, step: "Take the batch out of use and discard it" });
    }
    if (d) {
      const unitAlerts = alerts.filter((a) => a.deviceId === d.id);
      const hot = unitAlerts.find((a) => a.kind === "temp");
      if (isOffline(d, now)) {
        raise(STATUS.offline);
        problems.push({ severity: "offline", text: `No data from ${step.place} for ${fmtSpan(now - (d.lastTs ?? now))}`, step: "Check the temperature by hand" });
      } else if (hot) {
        raise(STATUS.critical);
        problems.push({ severity: "critical", text: hot.sentence, step: hot.steps[0] });
      }
      const door = unitAlerts.find((a) => a.kind === "door");
      if (door) {
        raise(STATUS.warning);
        problems.push({ severity: "warning", text: door.sentence, step: "Close the door" });
      }
    }
    const left = b.expiresAt - now;
    if (left > 0 && left < EXPIRY_SOON_S) {
      raise(STATUS.warning);
      problems.push({ severity: "warning", text: `Expires in ${fmtSpan(left)}`, step: "Make sure this batch goes out first" });
    }
    if (b.flightDeparts && (step.key === "produced" || step.key === "storage") && b.flightDeparts - now < PACK_BY_S) {
      raise(STATUS.warning);
      problems.push({ severity: "warning", text: `Not packed yet. ${b.flightNo} departs ${fmtUntil(b.flightDeparts, now)}`, step: `Pack it on ${b.trolleyName}` });
    }
  }

  return {
    batch: b,
    step,
    steps,
    stage: step.stage,
    place: step.place,
    deviceId: step.deviceId,
    temp,
    tempTs: d?.lastTs ?? null,
    intervalS: d?.intervalS ?? 60,
    status: departed ? { key: "departed", label: "Departed", hint: "No longer tracked on the ground." } : status,
    problems,
    departed,
  };
}

// Journey timeline, newest on top. Problems sit where they happened (DESIGN.md §5.2).
export function batchTimeline(b, devices, now) {
  const steps = b.steps.filter((s) => s.at <= now);
  const items = [];
  steps.forEach((s, i) => {
    const d = s.deviceId && devices[s.deviceId];
    const t = d ? readingAt(d, s.at + 60) : null;
    items.push({ type: "step", ts: s.at, label: s.label, place: s.place, temp: t, status: t !== null && outOfRange(t) ? "critical" : "ok" });
    if (!d) return;
    const end = steps[i + 1]?.at ?? now;
    let prev = null;
    let excStart = null;
    let excMax = null;
    const closeExc = (ts) => {
      if (excStart !== null && ts - excStart >= 60) {
        items.push({ type: "problem", severity: "critical", ts: excStart, label: `Too warm for ${fmtSpan(ts - excStart)}`, detail: `Up to ${excMax.toFixed(1)} °C in ${s.place}`, place: s.place });
      }
      excStart = null;
      excMax = null;
    };
    for (const p of d.history) {
      if (p.ts < s.at) continue;
      if (p.ts > end) break;
      if (prev && p.ts - prev.ts > d.intervalS * 3) {
        items.push({ type: "gap", severity: "warning", ts: prev.ts, label: `No temperature data for ${fmtSpan(p.ts - prev.ts)}`, detail: `${s.place}, ${fmtTime(prev.ts)} to ${fmtTime(p.ts)}`, place: s.place });
      }
      const v = warmestPoint(p);
      if (v !== null && v > LIMITS.tempMaxC) {
        if (excStart === null) excStart = p.ts;
        excMax = Math.max(excMax ?? v, v);
      } else if (v !== null) closeExc(p.ts);
      prev = p;
    }
    if (excStart !== null) {
      const ongoing = i === steps.length - 1;
      items.push({
        type: "problem",
        severity: "critical",
        ts: excStart,
        label: ongoing ? `Too warm since ${fmtTime(excStart)} (${fmtSpan(now - excStart)})` : `Too warm for ${fmtSpan(end - excStart)}`,
        detail: `Up to ${excMax.toFixed(1)} °C in ${s.place}`,
        place: s.place,
      });
    }
    if (!prev && d.history.length && d.history[0].ts > s.at) {
      items.push({ type: "gap", severity: "info", ts: s.at, label: "No data from before the dashboard opened", detail: "The prototype keeps the last 12 hours", place: s.place });
    }
  });
  if (now >= b.expiresAt && steps.at(-1)?.key !== "departed") {
    items.push({ type: "problem", severity: "critical", ts: b.expiresAt, label: "Expired", detail: "Must not be served", place: steps.at(-1)?.place });
  }
  return items.sort((a, b2) => b2.ts - a.ts);
}

// ---------- Flights ----------

export function flightState(f, states, now) {
  const all = f.codes.map((c) => states[c]).filter(Boolean);
  const total = f.codes.length;
  const produced = all.length;
  const packed = all.filter((s) => !["produced", "storage"].includes(s.step.key));
  const onTruck = all.filter((s) => ["truck", "aircraft", "departed"].includes(s.step.key));
  const loaded = all.filter((s) => ["aircraft", "departed"].includes(s.step.key));
  const meals = all.reduce((a, s) => a + s.batch.qty, 0);
  const toGo = f.departs - now;
  const departed = toGo <= 0;
  const bad = all.filter((s) => s.status.key === "critical" || s.status.key === "offline");
  const warn = all.filter((s) => s.status.key === "warning");
  const late = toGo < PACK_BY_S && packed.length < total;

  const checklist = [
    { label: "All meals produced", done: produced === total, note: `${produced} of ${total} batches` },
    { label: "Packed on trolley", done: packed.length === total, note: `${packed.length} of ${total} batches · by ${fmtTime(f.departs - PACK_BY_S)}` },
    { label: "Temperatures OK", done: bad.length === 0, note: bad.length ? `${plural(bad.length, "batch", "batches")} with a problem` : `${LIMITS.tempMinC}–${LIMITS.tempMaxC} °C` },
    { label: "Loaded on truck", done: onTruck.length === total, note: `by ${fmtTime(f.departs - 100 * MIN)}` },
    { label: "Loaded on aircraft", done: loaded.length === total, note: `by ${fmtTime(f.departs - 40 * MIN)}` },
  ];

  let status;
  let readiness;
  const ready = packed.length === total && bad.length === 0 && warn.length === 0;
  if (departed) {
    status = { key: "departed", label: "Departed" };
    readiness = `Departed ${fmtTime(f.departs)}`;
  } else if (bad.length) {
    status = STATUS.critical;
    readiness = `Not ready: ${plural(bad.length, "batch", "batches")} with a temperature problem`;
  } else if (late) {
    status = STATUS.warning;
    readiness = `Not ready: ${plural(total - packed.length, "batch", "batches")} not packed yet`;
  } else if (warn.length) {
    status = STATUS.warning;
    readiness = `Check: ${plural(warn.length, "batch", "batches")} need${warn.length === 1 ? "s" : ""} a look`;
  } else if (ready) {
    status = STATUS.ok;
    readiness = "Ready";
  } else {
    status = { key: "preparing", label: "Preparing" };
    readiness = `Preparing · packing starts ${fmtTime(f.departs - PACK_BY_S)}`;
  }
  return { flight: f, status, readiness, ready, departed, toGo, total, produced, packed: packed.length, loaded: loaded.length, meals, checklist, batches: all };
}

// ---------- Everything at once ----------

export function mealPicture(plan, devices, deviceAlertList, now) {
  const states = {};
  for (const b of plan.batches) {
    const s = batchState(b, devices, deviceAlertList, now);
    // Departed batches stay visible for 2 hours, then leave the ground system
    if (s && !(s.departed && now - s.step.at > 2 * H)) states[b.code] = s;
  }
  const flights = plan.flights.map((f) => flightState(f, states, now)).filter((x) => x.toGo > -2 * H && x.toGo < 12 * H);
  return { states, list: Object.values(states), flights, alerts: mealAlerts(states, flights, now) };
}

// Alerts about meals and flights, in the same shape as the device alerts
function mealAlerts(states, flights, now) {
  const out = [];
  const active = Object.values(states).filter((s) => !s.departed);
  for (const s of active) {
    const b = s.batch;
    if (now >= b.expiresAt) {
      out.push({
        id: `batch:${b.code}:expired`,
        kind: "expired",
        severity: "critical",
        title: "Batch expired",
        sentence: `${b.meal} (${b.qty} meals) expired ${fmtSpan(now - b.expiresAt)} ago`,
        place: s.place,
        detail: `Batch ${b.code}${b.missedFlight ? `, missed ${b.missedFlight}` : ""}.`,
        since: b.expiresAt,
        batchCode: b.code,
        steps: ["Take the batch out of use", "Discard it and record the reason"],
      });
    }
  }
  const soon = active.filter((s) => s.batch.expiresAt > now && s.batch.expiresAt - now < EXPIRY_SOON_S);
  if (soon.length) {
    const meals = soon.reduce((a, s) => a + s.batch.qty, 0);
    const first = soon.reduce((a, s) => (s.batch.expiresAt < a.batch.expiresAt ? s : a));
    out.push({
      id: "meals:expiring",
      kind: "expiring",
      severity: "warning",
      title: "Meals expiring soon",
      sentence: `${meals} meals expire in under ${fmtSpan(EXPIRY_SOON_S)}`,
      place: [...new Set(soon.map((s) => s.place))].join(", "),
      detail: `${plural(soon.length, "batch", "batches")}. First: ${first.batch.meal}, ${fmtUntil(first.batch.expiresAt, now)}.`,
      since: null,
      batchCodes: soon.map((s) => s.batch.code),
      steps: ["Make sure these batches go out first", "Check none will expire before their flight lands"],
    });
  }
  for (const f of flights) {
    if (f.departed || f.status.key !== "warning" || f.packed === f.total) continue;
    const waiting = f.batches.filter((s) => ["produced", "storage"].includes(s.step.key));
    out.push({
      id: `flight:${f.flight.no}:late`,
      kind: "packing",
      severity: "warning",
      title: "Flight not ready",
      sentence: `${f.flight.no} to ${f.flight.dest}: ${plural(waiting.length, "batch", "batches")} not packed yet`,
      place: waiting.map((s) => s.place).join(", "),
      detail: `Departs ${fmtTime(f.flight.departs)} (${fmtUntil(f.flight.departs, now)}). Packing was due at ${fmtTime(f.flight.departs - PACK_BY_S)}.`,
      since: f.flight.departs - PACK_BY_S,
      flightNo: f.flight.no,
      batchCodes: waiting.map((s) => s.batch.code),
      steps: waiting.map((s) => `Pack ${s.batch.meal} (${s.batch.code}) on ${deviceInfo(f.flight.trolley).name}`),
    });
  }
  return out;
}

// Batches currently in a unit
export const batchesIn = (list, deviceId) => list.filter((s) => !s.departed && s.deviceId === deviceId);
