// Derives the active alerts from the current device state.
// Every alert is written the way a supervisor would say it out loud and comes with
// the next steps (DESIGN.md §2.3 and §9). The dashboard itself does not change any data.
//
// Alert shape:
//   id        stable key (same alert on the next update keeps the same id)
//   kind      used to group similar alerts ("Weak signal on 2 units")
//   severity  critical | warning | info  (shown as Act now | Check soon | Info)
//   title     short name, used in exports
//   sentence  plain sentence shown on screen
//   place     where it is
//   detail    one extra line of facts
//   steps     what to do next
//   since     when it started (null if unknown)
//   deviceId  the unit it belongs to (device alerts)

import { LIMITS, THRESHOLDS } from "../config.js";
import { doorOpenSince } from "../data/store.js";
import { deviceInfo } from "../data/registry.js";
import { fmtSpan } from "./format.js";

const RANK = { critical: 0, warning: 1, info: 2 };
const BAD_RESETS = { brownout: "a power dip", watchdog: "the software froze", panic: "a software crash" };

// "Sensor 2" for multi-sensor units (channel 1), "Sensor" otherwise. No codes on screen.
export function sensorLabel(d, sensorId) {
  const s = d.sensors[sensorId];
  return s && s.ch !== undefined ? `Sensor ${s.ch + 1}` : "Sensor";
}

export function isOffline(d, now) {
  return d.lastTs === null || now - d.lastTs > d.intervalS * THRESHOLDS.offlineAfterIntervals;
}

export const outOfRange = (t) => t < LIMITS.tempMinC || t > LIMITS.tempMaxC;

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
  const name = deviceInfo(d.id).name;
  const multi = Object.keys(d.sensors).length > 1;
  const add = (severity, kind, key, a) => out.push({ id: `${d.id}:${key}`, kind, deviceId: d.id, device: name, place: name, severity, since: null, steps: [], ...a });

  if (isOffline(d, now)) {
    add("critical", "offline", "offline", {
      title: "No data received",
      sentence: `${name} has sent no data for ${fmtSpan(now - (d.lastTs ?? now))}`,
      detail: `It should report every ${d.intervalS} s.`,
      since: d.lastTs,
      steps: ["Check the unit is switched on and in range of Wi-Fi or mobile signal", "Check the meals' temperature by hand until data comes back"],
    });
  }

  for (const [id, s] of Object.entries(d.sensors)) {
    const where = multi ? `${sensorLabel(d, id)} on ${name}` : name;
    if (s.crc_ok === false) {
      add("warning", "crc", `crc:${id}`, {
        title: "Corrupted reading",
        sentence: `${where} sent a corrupted reading`,
        detail: "The reading failed its checksum and was not used.",
        since: s.ts,
        steps: ["Usually clears on the next reading", "If it keeps happening, check the sensor cable"],
      });
    } else if (s.status && s.status !== "ok") {
      add("warning", "sensor", `status:${id}`, {
        title: "Sensor fault",
        sentence: `${where} is not working (${s.status})`,
        detail: `Sensor ID ${id}`,
        since: s.ts,
        steps: ["Check the sensor is connected", "Ask the hardware team to replace it if it does not recover"],
      });
    } else if (Number.isFinite(s.temp_c) && outOfRange(s.temp_c)) {
      const since = excursionSince(d, id);
      const warm = s.temp_c > LIMITS.tempMaxC;
      add("critical", "temp", `temp:${id}`, {
        title: warm ? "Too warm" : "Too cold",
        sentence: `${where} is too ${warm ? "warm" : "cold"} (${s.temp_c.toFixed(1)} °C)${since ? ` for ${fmtSpan(now - since)}` : ""}`,
        detail: `Safe range ${LIMITS.tempMinC}–${LIMITS.tempMaxC} °C.`,
        since,
        sensorId: id,
        steps: warm
          ? [`Move the meals to a unit that is within ${LIMITS.tempMinC}–${LIMITS.tempMaxC} °C`, "Check the door is closed and the cooling is running", "Ask QA whether the meals must be put on hold"]
          : ["Check the cooling setting: the meals may freeze", "Ask QA whether the meals are still usable"],
      });
    }
    if (s.heater_last_run && now - s.heater_last_run < THRESHOLDS.heaterSkewS) {
      add("info", "heater", `heater:${id}`, {
        title: "Sensor heater ran",
        sentence: `${where} may read a little high for a few minutes`,
        detail: "The sensor's built-in heater ran to dry it. This is normal.",
        since: s.heater_last_run,
      });
    }
  }

  const openSince = doorOpenSince(d);
  if (openSince !== null) {
    const limit = d.door.alarm_threshold_s ?? THRESHOLDS.defaultDoorAlarmS;
    if (d.door.alarm || now - openSince > limit) {
      add("warning", "door", "door", {
        title: "Door open too long",
        sentence: `Door on ${name} has been open for ${fmtSpan(now - openSince)}`,
        detail: `Doors should be closed within ${fmtSpan(limit)}.`,
        since: openSince,
        steps: ["Close the door", "Check nothing is blocking it"],
      });
    }
  }

  if (d.missing.size > 0) {
    add("info", "missing", "missing", {
      title: "Messages missing",
      sentence: `${d.missing.size} message${d.missing.size === 1 ? "" : "s"} from ${name} never arrived`,
      detail: "Short gaps in the history are expected after connection problems.",
    });
  }
  if (d.storage) {
    if (d.storage.sd_present === false) {
      add("warning", "sd", "sd", {
        title: "Memory card missing",
        sentence: `${name} has no memory card`,
        detail: "Without it, data is lost while the unit is out of signal.",
        steps: ["Insert a microSD card"],
      });
    } else if (d.storage.write_errors > 0) {
      add("warning", "sd", "sdw", {
        title: "Memory card errors",
        sentence: `${name} cannot write to its memory card`,
        detail: `${d.storage.write_errors} failed writes.`,
        steps: ["Replace the microSD card"],
      });
    }
    if (d.storage.buffered_msgs > 0) {
      add("info", "buffer", "buf", {
        title: "Storing data offline",
        sentence: `${name} is storing ${d.storage.buffered_msgs} messages until it is back online`,
        detail: "They will be sent automatically when the connection returns.",
      });
    }
  }
  if (d.power && d.power.source === "battery" && d.power.battery_pct < THRESHOLDS.lowBatteryPct) {
    add("warning", "battery", "batt", {
      title: "Low battery",
      sentence: `${name} battery is low (${d.power.battery_pct}%)`,
      detail: `${(d.power.battery_mv / 1000).toFixed(2)} V. Running on battery.`,
      steps: ["Plug the unit in or swap the battery before the next trip"],
    });
  }
  if (d.network && d.network.rssi < THRESHOLDS.weakRssiDbm) {
    add("info", "signal", "rssi", {
      title: "Weak signal",
      sentence: `Weak signal on ${name}`,
      detail: `${d.network.rssi} dBm on ${d.network.type === "wifi" ? "Wi-Fi" : "mobile network"}. Data may arrive late.`,
    });
  }
  if (d.system && BAD_RESETS[d.system.reset_reason]) {
    add("warning", "restart", "reset", {
      title: "Unexpected restart",
      sentence: `${name} restarted because ${BAD_RESETS[d.system.reset_reason]}`,
      detail: "Data during the restart may be missing.",
      steps: d.system.reset_reason === "brownout" ? ["Check the battery and the power cable"] : ["Tell the hardware team if it happens again"],
    });
  }
  if (d.tsSource === "rtc") {
    add("info", "clock", "clock", {
      title: "Using internal clock",
      sentence: `${name} is using its internal clock`,
      detail: "Times may be a few seconds off until it syncs again.",
    });
  }
  return out;
}

export const sortAlerts = (list) => list.sort((a, b) => RANK[a.severity] - RANK[b.severity] || (a.since ?? Infinity) - (b.since ?? Infinity));

export function allAlerts(devices, now) {
  return sortAlerts(Object.values(devices).flatMap((d) => deviceAlerts(d, now)));
}

export function worstSeverity(alerts) {
  if (alerts.some((a) => a.severity === "critical")) return "critical";
  if (alerts.some((a) => a.severity === "warning")) return "warning";
  return "ok";
}
