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
import { fmtAgo, fmtDuration, fmtTime, fmtUntil } from "./format.js";

const r1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);

export function buildSnapshot({ devices, alerts, stats, now, rangeS, rangeLabel, picture }) {
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
    alerts: alerts.map((a) => ({ level: SEVERITY[a.severity].label, title: a.title, what: a.sentence, where: a.place, detail: a.detail, next_steps: a.steps, since: a.since ? fmtAgo(a.since, now) : null })),
    meal_batches: picture
      ? picture.list
          .filter((s) => !s.departed)
          .map((s) => ({
            code: s.batch.code,
            meal: s.batch.meal,
            meals: s.batch.qty,
            status: s.status.label,
            where: s.place,
            temp_c: r1(s.temp),
            flight: s.batch.flightNo ?? `missed ${s.batch.missedFlight}`,
            expires: fmtUntil(s.batch.expiresAt, now),
            problems: s.problems.map((p) => `${p.text}: ${p.step}`),
          }))
      : [],
    flights: picture
      ? picture.flights.map((f) => ({ flight: f.flight.no, to: f.flight.dest, departs: `${fmtTime(f.flight.departs)} (${fmtUntil(f.flight.departs, now)})`, status: f.status.label, readiness: f.readiness, meals: f.meals, packed: `${f.packed} of ${f.total}` }))
      : [],
  };
}

// ---------- Offline answers ----------

const has = (q, ...words) => words.some((w) => q.includes(w));

export function localAnswer(question, snap) {
  const q = question.toLowerCase();
  const unit = snap.units.find((u) => q.includes(u.name.toLowerCase()) || q.includes(u.name.toLowerCase().replace(/\s|-/g, "")));
  const list = (arr) => arr.map((x) => `• ${x}`).join("\n");

  if (unit) return describeUnit(unit, snap);

  const batch = snap.meal_batches.find((b) => q.includes(b.code.toLowerCase()));
  if (batch) {
    return `${batch.meal} (${batch.code}, ${batch.meals} meals): ${batch.status}. Now in ${batch.where}${batch.temp_c !== null ? ` at ${batch.temp_c} °C` : ""}. Flight ${batch.flight}. Expires ${batch.expires}.${batch.problems.length ? `\n${list(batch.problems)}` : ""}`;
  }
  const flight = snap.flights.find((f) => q.replace(/\s/g, "").includes(f.flight.toLowerCase().replace(/\s/g, "")));
  if (flight) return `${flight.flight} to ${flight.to}, departs ${flight.departs}: ${flight.readiness}. ${flight.meals} meals, ${flight.packed} batches packed.`;

  if (has(q, "flight", "ready", "depart")) {
    const up = snap.flights.filter((f) => f.status !== "Departed");
    const notReady = up.filter((f) => f.readiness !== "Ready");
    return `${up.length - notReady.length} of ${up.length} upcoming flights are ready.${notReady.length ? `\nNot ready yet:\n${list(notReady.map((f) => `${f.flight} to ${f.to}, departs ${f.departs}: ${f.readiness}`))}` : ""}`;
  }

  if (has(q, "expir", "meal", "batch")) {
    const soon = snap.meal_batches.filter((b) => b.problems.some((p) => /Expire/.test(p)));
    return soon.length ? `Batches that expire soon or have expired:\n${list(soon.map((b) => `${b.meal} (${b.code}) in ${b.where}: ${b.problems.join("; ")}`))}` : "No meal batches expire in the next 6 hours.";
  }

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
        "“Which flights are not ready?”",
        "“Which meals expire soon?” or a batch code",
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
    const off = snap.units.filter((u) => u.status === "No signal");
    const miss = snap.units.filter((u) => u.missing_messages > 0);
    return `${off.length ? `Offline: ${off.map((u) => u.name).join(", ")}.` : "All units are online."}${miss.length ? `\nMissing messages: ${miss.map((u) => `${u.name} (${u.missing_messages})`).join(", ")}.` : ""}`;
  }

  if (has(q, "alert", "critical", "warning", "problem", "issue", "wrong", "attention")) {
    if (snap.alerts.length === 0) return "There are no active alerts.";
    const lvl = [
      ["critical", "Act now"],
      ["act now", "Act now"],
      ["urgent", "Act now"],
      ["warning", "Check soon"],
      ["check soon", "Check soon"],
      ["info", "Info"],
    ].find(([w]) => q.includes(w))?.[1];
    const shown = lvl ? snap.alerts.filter((a) => a.level === lvl) : snap.alerts.filter((a) => a.level !== "Info");
    if (shown.length === 0) return lvl ? `There are no “${lvl}” alerts.` : "Nothing needs attention right now.";
    return `${shown.length} alert(s):\n${list(shown.map((a) => `[${a.level}] ${a.what}.${a.next_steps[0] ? ` Next: ${a.next_steps[0]}.` : ""}`))}`;
  }

  // Default: summary
  const crit = snap.alerts.filter((a) => a.level === "Act now");
  return (
    `Summary at ${snap.local_time}:\n` +
    list([
      `${snap.fleet.units} units, ${snap.fleet.sensors} sensors`,
      `Time in range (${snap.statistics_period}): ${snap.fleet.time_in_range_pct}%`,
      `Average temperature now: ${snap.fleet.avg_temp_now_c} °C`,
      `${snap.alerts.length} open alert(s), ${crit.length} to act on now${crit.length ? `: ${crit.map((a) => a.what).join("; ")}` : ""}`,
      `${snap.meal_batches.length} meal batches on the ground; ${snap.flights.filter((f) => f.readiness === "Ready").length} of ${snap.flights.filter((f) => f.status !== "Departed").length} upcoming flights ready`,
      `${snap.fleet.door_openings} door opening(s) in the ${snap.statistics_period}`,
    ]) +
    "\n\nAsk about a unit, a flight or a batch code, or about alerts, temperature, doors, batteries or signal."
  );
}

function describeUnit(u, snap) {
  const alerts = snap.alerts.filter((a) => a.where === u.name);
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
  lines.push(alerts.length ? `Alerts:\n${alerts.map((a) => `• [${a.level}] ${a.what}. ${a.detail}`).join("\n")}` : "No active alerts.");
  return lines.join("\n");
}
