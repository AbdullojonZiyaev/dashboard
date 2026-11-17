// Turns incoming sensor-node messages into dashboard state.
//
// Handles the four message types from the sending schedule:
//   telemetry  – every 30–60 s: envelope, gps, core readings, door.state
//                (every 10–30 min it also carries system, power, storage, network)
//   event      – sent immediately on a door change: envelope, door.state, gps
//   diagnostic – health only (system, power, storage, network)
//   boot       – on start-up: system (fw, chip, reset_reason) and the sensor map
//
// Data-quality rules:
//   - messages without msg_type, device_id, ts or seq are rejected
//   - a seq already seen is a duplicate and is dropped
//   - a jump in seq marks the skipped numbers as missing; a late (buffered)
//     message with one of those numbers removes it from the missing list
//   - a boot message restarts sequence tracking (seq is assumed to reset on boot)
//   - readings with crc_ok === false are counted but not plotted
//   - older (buffered) messages fill the history but never overwrite the latest state

import { HISTORY_LIMIT, SEEN_SEQ_LIMIT } from "../config.js";

const MSG_TYPES = new Set(["telemetry", "event", "diagnostic", "boot"]);
const HEALTH_PARTS = ["system", "power", "storage", "network"];

export const initialState = {
  devices: {},
  stats: { received: 0, rejected: 0, duplicates: 0 },
};

export function validate(msg) {
  if (!msg || typeof msg !== "object") return "not an object";
  if (!MSG_TYPES.has(msg.msg_type)) return "unknown msg_type";
  if (typeof msg.device_id !== "string" || !msg.device_id) return "missing device_id";
  if (!Number.isFinite(msg.ts)) return "missing ts";
  if (!Number.isInteger(msg.seq)) return "missing seq";
  return null;
}

function newDevice(id) {
  return {
    id,
    lastTs: null, // ts of the newest message
    intervalS: 60,
    tsSource: null,
    gps: null,
    maxSeq: null,
    seen: new Set(),
    missing: new Set(),
    duplicates: 0,
    bufferedReceived: 0,
    crcFailures: 0,
    sensors: {}, // sensor_id -> latest reading (+ mux/ch from the boot map)
    history: [], // [{ ts, "t:<sensor_id>": temp, "rh:<sensor_id>": rh }]
    door: null, // latest door object, or null if the node has no door sensor
    doorEvents: [], // [{ ts, state }]
    system: null,
    power: null,
    storage: null,
    network: null,
    lastFullTs: null,
  };
}

function cloneDevice(d) {
  return {
    ...d,
    seen: new Set(d.seen),
    missing: new Set(d.missing),
    sensors: { ...d.sensors },
    history: d.history.slice(),
    doorEvents: d.doorEvents.slice(),
  };
}

export function reducer(state, action) {
  if (action.type !== "messages") return state;
  const devices = { ...state.devices };
  const stats = { ...state.stats };
  const cloned = new Set();

  for (const msg of action.msgs) {
    if (validate(msg)) {
      stats.rejected++;
      continue;
    }
    stats.received++;
    if (!cloned.has(msg.device_id)) {
      const prev = devices[msg.device_id];
      devices[msg.device_id] = prev ? cloneDevice(prev) : newDevice(msg.device_id);
      cloned.add(msg.device_id);
    }
    applyMessage(devices[msg.device_id], msg, stats);
  }
  return { devices, stats };
}

function applyMessage(d, msg, stats) {
  if (msg.msg_type === "boot") {
    d.maxSeq = null;
    d.seen.clear();
    d.missing.clear();
  }

  // Duplicates and gaps
  if (d.seen.has(msg.seq)) {
    d.duplicates++;
    stats.duplicates++;
    return;
  }
  d.seen.add(msg.seq);
  if (d.seen.size > SEEN_SEQ_LIMIT) d.seen.delete(d.seen.values().next().value);
  if (d.maxSeq === null) {
    d.maxSeq = msg.seq;
  } else if (msg.seq > d.maxSeq) {
    const gapStart = Math.max(d.maxSeq + 1, msg.seq - 10000);
    for (let s = gapStart; s < msg.seq; s++) d.missing.add(s);
    d.maxSeq = msg.seq;
  } else {
    d.missing.delete(msg.seq);
  }

  const isNewest = d.lastTs === null || msg.ts >= d.lastTs;
  if (isNewest) {
    d.lastTs = msg.ts;
    if (msg.ts_source) d.tsSource = msg.ts_source;
    if (msg.interval_s) d.intervalS = msg.interval_s;
    if (msg.gps) d.gps = { ...msg.gps, ts: msg.ts };
  }
  if (msg.from_buffer) d.bufferedReceived++;

  if (Array.isArray(msg.sensors)) {
    // Boot message: serial-to-channel map
    for (const s of msg.sensors) {
      d.sensors[s.sensor_id] = { ...d.sensors[s.sensor_id], ...s };
    }
  }

  if (Array.isArray(msg.readings)) applyReadings(d, msg);
  if (msg.door) applyDoor(d, msg, isNewest);

  let hadHealth = false;
  for (const part of HEALTH_PARTS) {
    if (msg[part] && (!d[part] || msg.ts >= d[part].ts)) {
      d[part] = { ...d[part], ...msg[part], ts: msg.ts };
      hadHealth = true;
    }
  }
  if (hadHealth && msg.msg_type !== "boot") d.lastFullTs = Math.max(d.lastFullTs ?? 0, msg.ts);
}

function applyReadings(d, msg) {
  const point = { ts: msg.ts };
  let plotted = false;
  for (const r of msg.readings) {
    if (!r || !r.sensor_id) continue;
    const prev = d.sensors[r.sensor_id];
    if (!prev || prev.ts === undefined || msg.ts >= prev.ts) {
      d.sensors[r.sensor_id] = { ...prev, ...r, ts: msg.ts };
    }
    if (r.crc_ok === false) {
      d.crcFailures++;
      continue;
    }
    if (r.status && r.status !== "ok") continue;
    if (Number.isFinite(r.temp_c)) point[`t:${r.sensor_id}`] = r.temp_c;
    if (Number.isFinite(r.rh)) point[`rh:${r.sensor_id}`] = r.rh;
    plotted = true;
  }
  if (plotted) insertPoint(d.history, point);
}

// Keeps history sorted by ts; buffered messages can arrive out of order.
function insertPoint(history, point) {
  const last = history[history.length - 1];
  if (!last || last.ts < point.ts) {
    history.push(point);
  } else {
    let i = history.length - 1;
    while (i >= 0 && history[i].ts > point.ts) i--;
    if (i >= 0 && history[i].ts === point.ts) history[i] = { ...history[i], ...point };
    else history.splice(i + 1, 0, point);
  }
  if (history.length > HISTORY_LIMIT) history.splice(0, history.length - HISTORY_LIMIT);
}

function applyDoor(d, msg, isNewest) {
  const state = msg.door.state;
  const lastEvent = d.doorEvents[d.doorEvents.length - 1];
  // Event messages always record a change. A telemetry message records one only
  // if it disagrees with the latest known state (the event message may have been lost).
  const changed = msg.msg_type === "event" || (isNewest && d.door && d.door.state !== state);
  if (state && changed && !(lastEvent && lastEvent.ts === msg.ts && lastEvent.state === state)) {
    d.doorEvents.push({ ts: msg.ts, state });
    d.doorEvents.sort((a, b) => a.ts - b.ts);
    if (d.doorEvents.length > 500) d.doorEvents.shift();
  }
  if (isNewest) d.door = { ...d.door, ...msg.door, ts: msg.ts };
}

// When did the current door opening start? null if the door is closed.
export function doorOpenSince(d) {
  if (!d.door || d.door.state !== "open") return null;
  for (let i = d.doorEvents.length - 1; i >= 0; i--) {
    if (d.doorEvents[i].state === "open") return d.doorEvents[i].ts;
  }
  return d.door.ts;
}

// Door-open periods as [start, end] pairs, for shading the charts.
export function doorOpenPeriods(d, now) {
  const periods = [];
  let openAt = null;
  for (const e of d.doorEvents) {
    if (e.state === "open" && openAt === null) openAt = e.ts;
    if (e.state === "closed" && openAt !== null) {
      periods.push([openAt, e.ts]);
      openAt = null;
    }
  }
  if (openAt !== null) periods.push([openAt, now]);
  return periods;
}
