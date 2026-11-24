// Excel export (.xlsx). ExcelJS is loaded only when the button is pressed so it does
// not slow down the first page load.

import { LIMITS } from "../config.js";
import { deviceInfo } from "../data/registry.js";
import { sensorLabel } from "./alerts.js";
import { SEVERITY, powerInfo, resetText, signalInfo, unitStatus } from "./describe.js";
import { deviceStats } from "./stats.js";

const iso = (ts) => (ts ? new Date(ts * 1000) : null);

export function fileStamp(now) {
  const d = new Date(now * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportExcel({ devices, alerts, stats, now, rangeS, rangeLabel, source, picture }) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Meal Track & Trace dashboard";
  wb.created = new Date(now * 1000);
  const from = now - rangeS;

  const sheet = (name, columns, rows) => {
    const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = columns.map(([header, key, width, numFmt]) => ({ header, key, width: width ?? 16, style: numFmt ? { numFmt } : undefined }));
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F5EFF" } };
    rows.forEach((r) => ws.addRow(r));
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
    return ws;
  };
  const DATE = "yyyy-mm-dd hh:mm:ss";

  // Summary
  const summary = wb.addWorksheet("Summary");
  summary.columns = [{ width: 34 }, { width: 44 }];
  [
    ["Meal Track & Trace export"],
    [],
    ["Generated", iso(now)],
    ["Data source", source],
    ["Statistics period", `last ${rangeLabel}`],
    ["Temperature limits", `${LIMITS.tempMinC} to ${LIMITS.tempMaxC} °C (placeholder until the HACCP plan sets them)`],
    ["Units", devices.length],
    ["Meal batches on the ground", picture ? picture.list.filter((x) => !x.departed).length : "–"],
    ["Flights in the list", picture ? picture.flights.length : "–"],
    ["Active alerts", alerts.length],
    ...Object.keys(SEVERITY).map((k) => [`  ${SEVERITY[k].label}`, alerts.filter((a) => a.severity === k).length]),
    ["Messages received", stats.received],
    ["Messages rejected / duplicate", `${stats.rejected} / ${stats.duplicates}`],
  ].forEach((r) => summary.addRow(r));
  summary.getRow(1).font = { bold: true, size: 14 };
  summary.getCell("B3").numFmt = DATE;
  summary.getColumn(1).font = { bold: true };

  // Units
  sheet(
    "Units",
    [
      ["Unit", "unit", 14],
      ["Type", "kind", 8],
      ["Assignment", "assignment", 30],
      ["Device ID", "id", 24],
      ["Status", "status", 10],
      ["Temperature now (°C)", "temp", 18],
      ["Humidity now (%)", "rh", 16],
      [`Min (°C, ${rangeLabel})`, "min", 14, "0.0"],
      [`Avg (°C, ${rangeLabel})`, "avg", 14, "0.0"],
      [`Max (°C, ${rangeLabel})`, "max", 14, "0.0"],
      ["Time in range (%)", "inRange", 16, "0.0"],
      ["Excursions", "exc", 11],
      ["Door", "door", 10],
      ["Door openings", "openings", 13],
      ["Power", "power", 12],
      ["Battery (%)", "battery", 11],
      ["Signal (dBm)", "rssi", 12],
      ["Signal quality", "signal", 13],
      ["Last message", "last", 20, DATE],
      ["Latitude", "lat", 11],
      ["Longitude", "lon", 11],
    ],
    devices.map((d) => {
      const info = deviceInfo(d.id);
      const s = deviceStats(d, from, now);
      const temps = Object.values(d.sensors).map((x) => x.temp_c).filter(Number.isFinite);
      const rhs = Object.values(d.sensors).map((x) => x.rh).filter(Number.isFinite);
      return {
        unit: info.name,
        kind: info.kind,
        assignment: info.assignment,
        id: d.id,
        status: unitStatus(d, alerts, now).label,
        temp: temps.join(" / "),
        rh: rhs.join(" / "),
        min: s.all?.min,
        avg: s.all?.avg,
        max: s.all?.max,
        inRange: s.all?.inRangePct,
        exc: s.all?.excursions,
        door: d.door ? d.door.state : "no sensor",
        openings: s.doorOpenings ?? "",
        power: powerInfo(d.power).source ?? "",
        battery: d.power?.battery_pct,
        rssi: d.network?.rssi,
        signal: d.network ? signalInfo(d.network.rssi).label : "",
        last: iso(d.lastTs),
        lat: d.gps?.lat,
        lon: d.gps?.lon,
      };
    }),
  );

  // Alerts
  sheet(
    "Alerts",
    [
      ["Level", "severity", 12],
      ["Alert", "title", 22],
      ["What happened", "sentence", 50],
      ["Where", "place", 22],
      ["Details", "detail", 44],
      ["What to do", "steps", 60],
      ["Since", "since", 20, DATE],
    ],
    alerts.map((a) => ({ severity: SEVERITY[a.severity].label, title: a.title, sentence: a.sentence, place: a.place, detail: a.detail, steps: a.steps.join("; "), since: iso(a.since) })),
  );

  if (picture) {
    batchSheet(sheet, picture.list, now);
    sheet(
      "Flights",
      [
        ["Flight", "no", 9],
        ["To", "dest", 12],
        ["Departs", "dep", 20, DATE],
        ["Stand", "stand", 7],
        ["Trolley", "trolley", 14],
        ["Truck", "truck", 11],
        ["Meals", "meals", 8],
        ["Batches packed", "packed", 14],
        ["Status", "status", 12],
        ["Readiness", "ready", 44],
      ],
      picture.flights.map((f) => ({
        no: f.flight.no,
        dest: f.flight.dest,
        dep: iso(f.flight.departs),
        stand: f.flight.stand,
        trolley: deviceInfo(f.flight.trolley).name,
        truck: deviceInfo(f.flight.truck).name,
        meals: f.meals,
        packed: `${f.packed} of ${f.total}`,
        status: f.status.label,
        ready: f.readiness,
      })),
    );
  }

  // Readings (full history kept by the dashboard, one row per sensor reading)
  sheet(
    "Readings",
    [
      ["Time", "ts", 20, DATE],
      ["Unit", "unit", 14],
      ["Sensor", "sensor", 8],
      ["Sensor ID", "sid", 18],
      ["Temperature (°C)", "t", 16, "0.00"],
      ["Humidity (%)", "rh", 13, "0.0"],
      ["Within limits", "ok", 13],
    ],
    devices.flatMap((d) => {
      const name = deviceInfo(d.id).name;
      return d.history.flatMap((p) =>
        Object.keys(d.sensors)
          .filter((id) => Number.isFinite(p[`t:${id}`]))
          .map((id) => {
            // Sensor ID column keeps the hardware code for traceability
            const t = p[`t:${id}`];
            return { ts: iso(p.ts), unit: name, sensor: sensorLabel(d, id), sid: id, t, rh: p[`rh:${id}`], ok: t >= LIMITS.tempMinC && t <= LIMITS.tempMaxC ? "yes" : "NO" };
          }),
      );
    }),
  );

  // Door events
  sheet(
    "Door events",
    [
      ["Time", "ts", 20, DATE],
      ["Unit", "unit", 14],
      ["Event", "state", 10],
    ],
    devices.flatMap((d) => d.doorEvents.map((e) => ({ ts: iso(e.ts), unit: deviceInfo(d.id).name, state: e.state === "open" ? "opened" : "closed" }))).sort((a, b) => a.ts - b.ts),
  );

  // Device health
  sheet(
    "Device health",
    [
      ["Unit", "unit", 14],
      ["Firmware", "fw", 10],
      ["Uptime (h)", "up", 11, "0.0"],
      ["Restarts", "boots", 9],
      ["Last reset reason", "reset", 30],
      ["Free memory (KB)", "heap", 15],
      ["Chip temp (°C)", "chip", 13],
      ["I²C errors", "i2c", 10],
      ["Power source", "src", 12],
      ["Battery (%)", "batt", 11],
      ["Battery (V)", "bv", 11, "0.00"],
      ["SD card", "sd", 9],
      ["SD free (MB)", "sdfree", 12],
      ["Waiting on SD", "buf", 13],
      ["Network", "net", 10],
      ["Signal (dBm)", "rssi", 12],
      ["Reconnects", "rec", 11],
      ["Missing msgs", "miss", 12],
      ["Checksum failures", "crc", 16],
    ],
    devices.map((d) => ({
      unit: deviceInfo(d.id).name,
      fw: d.system?.fw,
      up: d.system?.uptime_s !== undefined ? d.system.uptime_s / 3600 : undefined,
      boots: d.system?.boot_count,
      reset: d.system ? resetText(d.system.reset_reason) : undefined,
      heap: d.system?.free_heap ? Math.round(d.system.free_heap / 1024) : undefined,
      chip: d.system?.chip_temp_c,
      i2c: d.system?.i2c_errors,
      src: d.power?.source,
      batt: d.power?.battery_pct,
      bv: d.power ? d.power.battery_mv / 1000 : undefined,
      sd: d.storage ? (d.storage.sd_present ? "present" : "MISSING") : undefined,
      sdfree: d.storage?.sd_free_mb,
      buf: d.storage?.buffered_msgs,
      net: d.network?.type,
      rssi: d.network?.rssi,
      rec: d.network?.reconnects,
      miss: d.missing.size,
      crc: d.crcFailures,
    })),
  );

  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `meal-track-trace_${fileStamp(now)}.xlsx`);
}

function batchSheet(sheet, states, now) {
  const DATE = "yyyy-mm-dd hh:mm:ss";
  sheet(
    "Batches",
    [
      ["Batch", "code", 14],
      ["Meal", "meal", 24],
      ["Meals", "qty", 8],
      ["Status", "status", 12],
      ["Where now", "place", 26],
      ["Temperature now (°C)", "temp", 18, "0.0"],
      ["Flight", "flight", 9],
      ["Departs", "dep", 20, DATE],
      ["Produced", "produced", 20, DATE],
      ["Expires", "expires", 20, DATE],
      ["Hours left", "left", 11, "0.0"],
      ["What to do", "todo", 60],
    ],
    states.map((s) => ({
      code: s.batch.code,
      meal: s.batch.meal,
      qty: s.batch.qty,
      status: s.status.label,
      place: s.place,
      temp: s.temp ?? undefined,
      flight: s.batch.flightNo ?? `missed ${s.batch.missedFlight}`,
      dep: iso(s.batch.flightDeparts),
      produced: iso(s.batch.producedAt),
      expires: iso(s.batch.expiresAt),
      left: (s.batch.expiresAt - now) / 3600,
      todo: s.problems.map((p) => `${p.text}: ${p.step}`).join("; "),
    })),
  );
}

// Export of a list of batches only (Batches screen: whole list or the selected rows)
export async function exportBatches({ states, now, label }) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Meal Track & Trace dashboard";
  const sheet = (name, columns, rows) => {
    const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = columns.map(([header, key, width, numFmt]) => ({ header, key, width: width ?? 16, style: numFmt ? { numFmt } : undefined }));
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F5EFF" } };
    rows.forEach((r) => ws.addRow(r));
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  };
  batchSheet(sheet, states, now);
  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${label}_${fileStamp(now)}.xlsx`);
}
