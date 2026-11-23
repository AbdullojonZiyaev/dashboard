// The dashboard assistant.
// buildSnapshot() turns the current dashboard state into a compact JSON summary that
// is sent to Claude with each question. localAnswer() answers common questions from
// the same snapshot when Claude is not available (no API key configured).

import { LIMITS } from "../config.js";
import { deviceInfo } from "../data/registry.js";
import { doorOpenSince } from "../data/store.js";
import { sensorLabel } from "./alerts.js";
import { SEVERITY, SIGNAL_HELP, powerInfo, signalInfo, unitStatus } from "./describe.js";
import { deviceStats, fleetStats } from "./stats.js";
import { fmtAgo, fmtDuration, fmtTime } from "./format.js";

const r1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);

export function buildSnapshot({ devices, alerts, stats, now, rangeS, rangeLabel }) {
  const from = now - rangeS;
  const fleet = fleetStats(devices, from, now);
  return {
    generated_at: new Date(now * 1000).toISOString(),
    local_time: fmtTime(now),
    temperature_limits_c: { min: LIMITS.tempMinC, max: LIMITS.tempMaxC, note: "placeholder until the HACCP plan sets them" },
    statistics_period: `last ${rangeLabel}`,
    fleet: {
      units: devices.length,
      sensors: fleet.sensorCount,
      time_in_range_pct: r1(fleet.inRangePct),
      avg_temp_now_c: r1(fleet.avgNow),
      door_openings: fleet.doorOpenings,
      messages_received: stats.received,
      messages_rejected: stats.rejected,
      duplicates: stats.duplicates,
    },
    units: devices.map((d) => {
      const info = deviceInfo(d.id);
      const s = deviceStats(d, from, now);
      const open = doorOpenSince(d);
      return {
        name: info.name,
        type: info.kind,
        assignment: info.assignment,
        device_id: d.id,
        status: unitStatus(d, alerts, now).label,
        last_message: fmtAgo(d.lastTs, now),
        sensors: Object.entries(d.sensors).map(([id, x]) => ({
          channel: sensorLabel(d, id),
          sensor_id: id,
          temp_c: x.temp_c,
          humidity_pct: x.rh,
          status: x.status,
          checksum_ok: x.crc_ok !== false,
        })),
        period_stats: s.all && { min_c: r1(s.all.min), avg_c: r1(s.all.avg), max_c: r1(s.all.max), time_in_range_pct: r1(s.all.inRangePct), excursions: s.all.excursions },
        door: d.door ? { state: d.door.state, open_for: open ? fmtDuration(now - open) : null, openings_in_period: s.doorOpenings } : "no door sensor",
        power: d.power ? powerInfo(d.power).label : "not reported yet",
        signal: d.network ? `${d.network.rssi} dBm (${signalInfo(d.network.rssi).label}, ${d.network.type})` : "not reported yet",
        location: d.gps ? { lat: d.gps.lat, lon: d.gps.lon } : null,
        last_reset_reason: d.system?.reset_reason ?? null,
        missing_messages: d.missing.size,
      };
    }),
    alerts: alerts.map((a) => ({ level: a.severity, title: a.title, unit: a.device, detail: a.detail, since: a.since ? fmtAgo(a.since, now) : null })),
  };
}

// ---------- Offline answers ----------

const has = (q, ...words) => words.some((w) => q.includes(w));

export function localAnswer(question, snap) {
  const q = question.toLowerCase();
  const unit = snap.units.find((u) => q.includes(u.name.toLowerCase()) || q.includes(u.name.toLowerCase().replace(/\s|-/g, "")));
  const list = (arr) => arr.map((x) => `• ${x}`).join("\n");

  if (unit) return describeUnit(unit, snap);

  if (has(q, "help", "what can you", "how do i", "hello", "hi ")) {
    return (
      "I can answer questions about the live dashboard data, for example:\n" +
      list([
        "“Give me a summary”",
        "“Which units have alerts?” or “What is critical?”",
        "“Any temperature excursions?”",
        "“Which battery is lowest?”",
        "“Which doors are open?”",
        "“What does dBm mean?”",
        "“How is Truck T-07?” (any unit name)",
      ])
    );
  }

  if (has(q, "dbm", "signal", "rssi")) {
    const weak = snap.units.filter((u) => /Weak|Fair/.test(u.signal));
    return `${SIGNAL_HELP}\n\n${weak.length ? `Units with fair or weak signal:\n${list(weak.map((u) => `${u.name}: ${u.signal}`))}` : "All units have good signal."}`;
  }

  if (has(q, "excursion", "temperature", "temp", "hot", "warm", "cold", "limit")) {
    const out = snap.units.flatMap((u) =>
      u.sensors.filter((s) => s.temp_c > snap.temperature_limits_c.max || s.temp_c < snap.temperature_limits_c.min).map((s) => `${u.name} ${s.channel}: ${s.temp_c} °C`),
    );
    const head = out.length
      ? `${out.length} sensor(s) are outside the ${snap.temperature_limits_c.min}–${snap.temperature_limits_c.max} °C limits right now:\n${list(out)}`
      : `All sensors are within the ${snap.temperature_limits_c.min}–${snap.temperature_limits_c.max} °C limits right now.`;
    return `${head}\n\nAverage temperature now: ${snap.fleet.avg_temp_now_c} °C. Time in range (${snap.statistics_period}): ${snap.fleet.time_in_range_pct}%.`;
  }

  if (has(q, "battery", "power", "charge")) {
    return `Power status:\n${list(snap.units.map((u) => `${u.name}: ${u.power}`))}`;
  }

  if (has(q, "door")) {
    const doors = snap.units.filter((u) => typeof u.door === "object");
    return `Doors:\n${list(doors.map((u) => `${u.name}: ${u.door.state}${u.door.open_for ? ` for ${u.door.open_for}` : ""} · ${u.door.openings_in_period} opening(s) in the ${snap.statistics_period}`))}`;
  }

  if (has(q, "offline", "online", "connect", "missing", "lost")) {
    const off = snap.units.filter((u) => u.status === "Offline");
    const miss = snap.units.filter((u) => u.missing_messages > 0);
    return `${off.length ? `Offline: ${off.map((u) => u.name).join(", ")}.` : "All units are online."}${miss.length ? `\nMissing messages: ${miss.map((u) => `${u.name} (${u.missing_messages})`).join(", ")}.` : ""}`;
  }

  if (has(q, "alert", "critical", "warning", "problem", "issue", "wrong", "attention")) {
    if (snap.alerts.length === 0) return "There are no active alerts.";
    const lvl = ["critical", "warning", "info"].find((l) => q.includes(l));
    const shown = lvl ? snap.alerts.filter((a) => a.level === lvl) : snap.alerts;
    if (shown.length === 0) return `There are no ${lvl} alerts.`;
    return `${shown.length} active alert(s):\n${list(shown.map((a) => `[${SEVERITY[a.level].label}] ${a.unit}: ${a.title} — ${a.detail}${a.since ? ` (since ${a.since})` : ""}`))}`;
  }

  // Default: summary
  const crit = snap.alerts.filter((a) => a.level === "critical");
  return (
    `Summary at ${snap.local_time}:\n` +
    list([
      `${snap.fleet.units} units, ${snap.fleet.sensors} sensors`,
      `Time in range (${snap.statistics_period}): ${snap.fleet.time_in_range_pct}%`,
      `Average temperature now: ${snap.fleet.avg_temp_now_c} °C`,
      `${snap.alerts.length} active alert(s), ${crit.length} critical${crit.length ? `: ${crit.map((a) => `${a.unit} ${a.title.toLowerCase()}`).join("; ")}` : ""}`,
      `${snap.fleet.door_openings} door opening(s) in the ${snap.statistics_period}`,
    ]) +
    "\n\nAsk about a unit by name, or about alerts, temperature, doors, batteries or signal."
  );
}

function describeUnit(u, snap) {
  const alerts = snap.alerts.filter((a) => a.unit === u.name);
  const lines = [
    `${u.name} (${u.type}, ${u.assignment}) — status: ${u.status}, last message ${u.last_message}.`,
    `Temperature now: ${u.sensors.map((s) => `${s.temp_c} °C${u.sensors.length > 1 ? ` (${s.channel})` : ""}`).join(", ")}; humidity ${u.sensors.map((s) => `${s.humidity_pct}%`).join(", ")}.`,
  ];
  if (u.period_stats)
    lines.push(
      `Over the ${snap.statistics_period}: min ${u.period_stats.min_c} °C, avg ${u.period_stats.avg_c} °C, max ${u.period_stats.max_c} °C, ${u.period_stats.time_in_range_pct}% in range, ${u.period_stats.excursions} excursion(s).`,
    );
  lines.push(typeof u.door === "object" ? `Door: ${u.door.state}${u.door.open_for ? ` for ${u.door.open_for}` : ""}, ${u.door.openings_in_period} opening(s).` : "No door sensor fitted.");
  lines.push(`Power: ${u.power}. Signal: ${u.signal}.`);
  lines.push(alerts.length ? `Alerts:\n${alerts.map((a) => `• [${SEVERITY[a.level].label}] ${a.title} — ${a.detail}`).join("\n")}` : "No active alerts.");
  return lines.join("\n");
}
