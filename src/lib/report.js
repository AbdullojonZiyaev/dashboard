// PDF report download. jsPDF is loaded only when the button is pressed.
// The report covers the selected period: summary, per-unit statistics with a small
// temperature chart, active alerts, door events and device health.

import { LIMITS } from "../config.js";
import { deviceInfo } from "../data/registry.js";
import { sensorLabel } from "./alerts.js";
import { SEVERITY, powerInfo, resetText, signalInfo, unitStatus } from "./describe.js";
import { fleetStats, deviceStats } from "./stats.js";
import { fmtDuration, fmtTime } from "./format.js";
import { fileStamp } from "./export.js";

// The built-in PDF fonts only cover Latin-1; replace the few characters they lack.
const pdfText = (s) => String(s ?? "–").replace(/→/g, "->").replace(/−/g, "-").replace(/[✓✕]/g, "");
const num = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "–");
const dateTime = (ts) => new Date(ts * 1000).toLocaleString();

const NAVY = [31, 94, 255]; // brand blue (DESIGN.md §3.2)
const SEV_COLOR = { critical: [212, 47, 47], warning: [217, 142, 4], info: [91, 100, 114] };
const LINE_COLORS = [
  [37, 99, 235],
  [13, 148, 136],
  [147, 51, 234],
];

export async function downloadReport({ devices, alerts, stats, now, rangeS, rangeLabel, source, picture }) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 14;
  const from = now - rangeS;
  let y = M;

  const ensure = (h) => {
    if (y + h > H - 16) {
      doc.addPage();
      y = M;
    }
  };
  const heading = (text) => {
    ensure(14);
    doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(...NAVY);
    doc.text(text, M, y + 5);
    y += 9;
    doc.setTextColor(20, 33, 61).setFont("helvetica", "normal").setFontSize(10);
  };
  const table = (head, body, opts = {}) => {
    autoTable(doc, {
      startY: y,
      head: [head.map(pdfText)],
      body: body.map((r) => r.map(pdfText)),
      margin: { left: M, right: M },
      styles: { fontSize: 8.5, cellPadding: 1.6 },
      headStyles: { fillColor: NAVY },
      alternateRowStyles: { fillColor: [244, 246, 250] },
      ...opts,
    });
    y = doc.lastAutoTable.finalY + 6;
  };

  // Title block
  doc.setFillColor(...NAVY).rect(0, 0, W, 26, "F");
  doc.setTextColor(255, 255, 255).setFont("helvetica", "bold").setFontSize(17);
  doc.text("Meal Track & Trace: Food Safety Report", M, 12);
  doc.setFont("helvetica", "normal").setFontSize(9.5);
  doc.text(pdfText(`Airline Ready-Meal Track & Trace · generated ${dateTime(now)} · period: last ${rangeLabel} (${fmtTime(from)} to ${fmtTime(now)})`), M, 19);
  y = 34;

  // Summary
  const fleet = fleetStats(devices, from, now);
  const crit = alerts.filter((a) => a.severity === "critical").length;
  const warn = alerts.filter((a) => a.severity === "warning").length;
  heading("Summary");
  table(
    ["Measure", "Value"],
    [
      ["Units monitored", `${devices.length} (${fleet.sensorCount} sensors)`],
      ["Temperature limits", `${LIMITS.tempMinC} to ${LIMITS.tempMaxC} °C (placeholder until the HACCP plan sets them)`],
      ["Time in range (all sensors)", fleet.inRangePct === null ? "–" : `${num(fleet.inRangePct)} %`],
      ["Average temperature now", `${num(fleet.avgNow)} °C (from ${num(fleet.minNow)} to ${num(fleet.maxNow)} °C)`],
      ["Active alerts", `${alerts.length} (${crit} critical, ${warn} warning)`],
      ["Door openings in period", String(fleet.doorOpenings)],
      ["Messages received", `${stats.received} (${stats.duplicates} duplicate, ${stats.rejected} rejected)`],
      ["Data source", source],
    ],
    { theme: "grid", columnStyles: { 0: { cellWidth: 60, fontStyle: "bold" } } },
  );

  // Units overview
  heading("Units");
  table(
    ["Unit", "Assignment", "Status", "Min °C", "Avg °C", "Max °C", "In range", "Excursions", "Door openings", "Power", "Signal"],
    devices.map((d) => {
      const info = deviceInfo(d.id);
      const s = deviceStats(d, from, now);
      const p = powerInfo(d.power);
      return [
        info.name,
        info.assignment,
        unitStatus(d, alerts, now).label,
        num(s.all?.min),
        num(s.all?.avg),
        num(s.all?.max),
        s.all ? `${num(s.all.inRangePct)} %` : "–",
        s.all?.excursions ?? "–",
        s.doorOpenings ?? "no sensor",
        p.pct === null ? "–" : `${p.short} ${p.pct}%`,
        d.network ? `${signalInfo(d.network.rssi).label} (${d.network.rssi} dBm)` : "–",
      ];
    }),
    {
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 2) {
          const v = data.cell.raw;
          if (v === "Act now") data.cell.styles.textColor = SEV_COLOR.critical;
          if (v === "No signal") data.cell.styles.textColor = SEV_COLOR.info;
          if (v === "Check soon") data.cell.styles.textColor = SEV_COLOR.warning;
        }
      },
    },
  );

  // Alerts
  heading("Active alerts");
  if (alerts.length === 0) {
    doc.text("No active alerts.", M, y + 3);
    y += 9;
  } else {
    table(
      ["Level", "What happened", "Where", "What to do", "Since"],
      alerts.map((a) => [SEVERITY[a.severity].label, a.sentence, a.place, a.steps.join("; ") || "-", a.since ? `${fmtTime(a.since)} (${fmtDuration(now - a.since)})` : ""]),
      {
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index === 0) {
            const sev = alerts[data.row.index]?.severity;
            data.cell.styles.textColor = SEV_COLOR[sev];
            data.cell.styles.fontStyle = "bold";
          }
        },
      },
    );
  }

  // Flights
  if (picture) {
    heading("Flights");
    table(
      ["Flight", "To", "Departs", "Meals", "Packed", "Status", "Readiness"],
      picture.flights.map((f) => [f.flight.no, f.flight.dest, fmtTime(f.flight.departs), f.meals, `${f.packed} of ${f.total}`, f.status.label, f.readiness]),
      {
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index === 5) {
            const v = data.cell.raw;
            if (v === "Act now") data.cell.styles.textColor = SEV_COLOR.critical;
            if (v === "Check soon") data.cell.styles.textColor = SEV_COLOR.warning;
          }
        },
      },
    );
    const attention = picture.list.filter((s) => !s.departed && s.problems.length);
    heading("Meal batches that need attention");
    if (attention.length === 0) {
      doc.text("None.", M, y + 3);
      y += 9;
    } else {
      table(
        ["Batch", "Meal", "Meals", "Where", "Status", "What to do"],
        attention.map((s) => [s.batch.code, s.batch.meal, s.batch.qty, s.place, s.status.label, s.problems.map((p) => `${p.text}: ${p.step}`).join("; ")]),
      );
    }
  }

  // Per-unit temperature charts
  heading(`Temperature per unit (last ${rangeLabel})`);
  for (const d of devices) {
    ensure(52);
    drawChart(doc, d, from, now, M, y, W - 2 * M, 44);
    y += 50;
  }

  // Door events
  const events = devices
    .flatMap((d) => d.doorEvents.filter((e) => e.ts >= from).map((e) => ({ ...e, unit: deviceInfo(d.id).name })))
    .sort((a, b) => b.ts - a.ts);
  heading(`Door events (last ${rangeLabel})`);
  if (events.length === 0) {
    doc.text("No door events in this period.", M, y + 3);
    y += 9;
  } else {
    table(["Time", "Unit", "Event"], events.slice(0, 60).map((e) => [dateTime(e.ts), e.unit, e.state === "open" ? "opened" : "closed"]));
    if (events.length > 60) {
      doc.setFontSize(8.5).text(`${events.length - 60} older events are in the Excel export.`, M, y - 2);
      y += 4;
    }
  }

  // Device health
  heading("Device health");
  table(
    ["Unit", "Firmware", "Uptime", "Last reset", "Battery", "SD card", "Missing msgs", "Checksum fails"],
    devices.map((d) => [
      deviceInfo(d.id).name,
      d.system?.fw,
      d.system?.uptime_s !== undefined ? fmtDuration(d.system.uptime_s) : "–",
      d.system ? resetText(d.system.reset_reason) : "–",
      d.power ? `${d.power.battery_pct}% (${(d.power.battery_mv / 1000).toFixed(2)} V)` : "–",
      d.storage ? (d.storage.sd_present ? `${d.storage.sd_free_mb} MB free` : "MISSING") : "–",
      d.missing.size,
      d.crcFailures,
    ]),
  );

  // Footer on every page
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8).setTextColor(100, 112, 138);
    doc.text(`Read-only dashboard report · limits are placeholders until the HACCP plan sets them`, M, H - 8);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 8, { align: "right" });
  }

  doc.save(`food-safety-report_${fileStamp(now)}.pdf`);
}

function drawChart(doc, d, from, now, x, y, w, h) {
  const info = deviceInfo(d.id);
  doc.setFont("helvetica", "bold").setFontSize(9.5).setTextColor(20, 33, 61);
  doc.text(pdfText(`${info.name} · ${info.assignment}`), x, y + 3);
  const top = y + 6;
  const ch = h - 10;
  const left = x + 10;
  const cw = w - 10;
  const sensors = Object.keys(d.sensors);
  const pts = d.history.filter((p) => p.ts >= from);
  const vals = pts.flatMap((p) => sensors.map((s) => p[`t:${s}`]).filter(Number.isFinite));
  doc.setDrawColor(221, 227, 238).setLineWidth(0.2).rect(left, top, cw, ch);
  if (vals.length < 2) {
    doc.setFont("helvetica", "normal").setFontSize(8).text("No readings in this period.", left + 3, top + 6);
    return;
  }
  const lo = Math.floor(Math.min(...vals, LIMITS.tempMinC) - 1);
  const hi = Math.ceil(Math.max(...vals, LIMITS.tempMaxC) + 1);
  const X = (ts) => left + ((ts - from) / (now - from)) * cw;
  const Y = (t) => top + ch - ((t - lo) / (hi - lo)) * ch;

  // Axis labels
  doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(100, 112, 138);
  for (const t of [lo, LIMITS.tempMinC, LIMITS.tempMaxC, hi]) doc.text(`${t}°`, x + 8, Y(t) + 1, { align: "right" });
  doc.text(fmtTime(from), left, top + ch + 3.5);
  doc.text(fmtTime(now), left + cw, top + ch + 3.5, { align: "right" });

  // Limit lines
  doc.setDrawColor(220, 38, 38).setLineWidth(0.3).setLineDashPattern([1.2, 1], 0);
  doc.line(left, Y(LIMITS.tempMaxC), left + cw, Y(LIMITS.tempMaxC));
  doc.line(left, Y(LIMITS.tempMinC), left + cw, Y(LIMITS.tempMinC));
  doc.setLineDashPattern([], 0);

  // One line per sensor
  sensors.forEach((s, i) => {
    const series = pts.filter((p) => Number.isFinite(p[`t:${s}`]));
    doc.setDrawColor(...LINE_COLORS[i % LINE_COLORS.length]).setLineWidth(0.4);
    for (let k = 1; k < series.length; k++) {
      const a = series[k - 1];
      const b = series[k];
      if (b.ts - a.ts > d.intervalS * 5) continue; // gap in data
      doc.line(X(a.ts), Y(a[`t:${s}`]), X(b.ts), Y(b[`t:${s}`]));
    }
    if (sensors.length > 1) {
      doc.setTextColor(...LINE_COLORS[i % LINE_COLORS.length]);
      doc.text(sensorLabel(d, s), left + cw - 2 - (sensors.length - 1 - i) * 12, top + 4, { align: "right" });
    }
  });
}
