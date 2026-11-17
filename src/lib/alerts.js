// Derives the active alerts from the current device state.
// The dashboard is read-only: it shows alerts but does not change any data.

import { LIMITS, THRESHOLDS } from "../config.js";
import { doorOpenSince } from "../data/store.js";
import { deviceInfo } from "../data/registry.js";

const RANK = { critical: 0, warning: 1, info: 2 };
const BAD_RESETS = new Set(["brownout", "watchdog", "panic"]);

export function sensorLabel(d, sensorId) {
  const s = d.sensors[sensorId];
  return s && s.ch !== undefined ? `ch ${s.ch}` : sensorId;
}

export function isOffline(d, now) {
  return d.lastTs === null || now - d.lastTs > d.intervalS * THRESHOLDS.offlineAfterIntervals;
}

function outOfRange(t) {
  return t < LIMITS.tempMinC || t > LIMITS.tempMaxC;
}

// Start of the current excursion: walk back while the readings stay out of range.
function excursionSince(d, sensorId) {
  const key = `t:${sensorId}`;
  let since = null;
  for (let i = d.history.length - 1; i >= 0; i--) {
    const t = d.history[i][key];
    if (t === undefined) continue;
    if (!outOfRange(t)) break;
    since = d.history[i].ts;
  }
  return since;
}

export function deviceAlerts(d, now) {
  const out = [];
  const add = (severity, key, title, detail, since = null) =>
    out.push({ id: `${d.id}:${key}`, deviceId: d.id, device: deviceInfo(d.id).name, severity, title, detail, since });

  if (isOffline(d, now)) {
    add("critical", "offline", "No data received", `Expected every ${d.intervalS} s`, d.lastTs);
  }

  for (const [id, s] of Object.entries(d.sensors)) {
    const label = sensorLabel(d, id);
    if (s.crc_ok === false) {
      add("warning", `crc:${id}`, "Corrupted reading", `${label}: checksum failed`, s.ts);
    } else if (s.status && s.status !== "ok") {
      add("warning", `status:${id}`, `Sensor ${s.status}`, `${label} (${id})`, s.ts);
    } else if (Number.isFinite(s.temp_c) && outOfRange(s.temp_c)) {
      add(
        "critical",
        `temp:${id}`,
        "Temperature excursion",
        `${s.temp_c.toFixed(1)} °C on ${label} · limit ${LIMITS.tempMinC}–${LIMITS.tempMaxC} °C`,
        excursionSince(d, id),
      );
    }
    if (s.heater_last_run && now - s.heater_last_run < THRESHOLDS.heaterSkewS) {
      add("info", `heater:${id}`, "Sensor heater ran", `${label} may read high for a few minutes`, s.heater_last_run);
    }
  }

  const openSince = doorOpenSince(d);
  if (openSince !== null) {
    const limit = d.door.alarm_threshold_s ?? THRESHOLDS.defaultDoorAlarmS;
    if (d.door.alarm || now - openSince > limit) {
      add("warning", "door", "Door open too long", `Alarm after ${limit} s`, openSince);
    }
  }

  if (d.missing.size > 0) {
    add("info", "missing", "Messages missing", `${d.missing.size} sequence number(s) never arrived`);
  }
  if (d.storage) {
    if (d.storage.sd_present === false) add("warning", "sd", "SD card missing", "Offline buffering is not possible");
    else if (d.storage.write_errors > 0) add("warning", "sdw", "SD write errors", `${d.storage.write_errors} failed writes`);
    if (d.storage.buffered_msgs > 0) add("info", "buf", "Messages buffered", `${d.storage.buffered_msgs} waiting on the SD card`);
  }
  if (d.power && d.power.source === "battery" && d.power.battery_pct < THRESHOLDS.lowBatteryPct) {
    add("warning", "batt", "Low battery", `${d.power.battery_pct}% (${d.power.battery_mv} mV)`);
  }
  if (d.network && d.network.rssi < THRESHOLDS.weakRssiDbm) {
    add("info", "rssi", "Weak signal", `${d.network.rssi} dBm (${d.network.type})`);
  }
  if (d.system && BAD_RESETS.has(d.system.reset_reason)) {
    add("warning", "reset", "Unexpected restart", `Last reset reason: ${d.system.reset_reason}`);
  }
  if (d.tsSource === "rtc") {
    add("info", "clock", "Time from internal clock", "Less accurate than GPS or NTP");
  }
  return out;
}

export function allAlerts(devices, now) {
  return Object.values(devices)
    .flatMap((d) => deviceAlerts(d, now))
    .sort((a, b) => RANK[a.severity] - RANK[b.severity] || (a.since ?? Infinity) - (b.since ?? Infinity));
}

export function worstSeverity(alerts) {
  if (alerts.some((a) => a.severity === "critical")) return "critical";
  if (alerts.some((a) => a.severity === "warning")) return "warning";
  return "ok";
}
