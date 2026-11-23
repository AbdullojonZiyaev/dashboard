import { LIMITS } from "../config.js";
import { deviceInfo } from "../data/registry.js";
import { isOffline } from "../lib/alerts.js";
import { fmtNum } from "../lib/format.js";

export default function KpiStrip({ devices, alerts, stats, fleet, rangeLabel, now }) {
  const online = devices.filter((d) => !isOffline(d, now)).length;
  const critical = alerts.filter((a) => a.severity === "critical").length;
  const warning = alerts.filter((a) => a.severity === "warning").length;
  const excursions = alerts.filter((a) => a.title === "Temperature excursion").length;
  const missing = devices.reduce((n, d) => n + d.missing.size, 0);
  const low = fleet.lowestBattery;

  return (
    <section className="kpis" aria-label="Summary">
      <Kpi label="Units online" value={`${online} / ${devices.length}`} note={`${fleet.sensorCount} sensors`} tone={online < devices.length ? "bad" : "good"} />
      <Kpi
        label="Temperature excursions"
        value={excursions}
        note={excursions ? "sensor(s) out of limits now" : `all within ${LIMITS.tempMinC}–${LIMITS.tempMaxC} °C`}
        tone={excursions ? "bad" : "good"}
      />
      <Kpi label="Active alerts" value={critical + warning} note={`${critical} critical · ${warning} warning`} tone={critical ? "bad" : warning ? "warn" : "good"} />
      <Kpi
        label={`Time in range (${rangeLabel})`}
        value={fleet.inRangePct === null ? "–" : `${fleet.inRangePct.toFixed(1)}%`}
        note="readings within the limits"
        tone={fleet.inRangePct === null ? "" : fleet.inRangePct >= 99 ? "good" : fleet.inRangePct >= 95 ? "warn" : "bad"}
      />
      <Kpi
        label="Average temperature now"
        value={fmtNum(fleet.avgNow, 1, " °C")}
        note={`range ${fmtNum(fleet.minNow, 1)} to ${fmtNum(fleet.maxNow, 1, " °C")}`}
      />
      <Kpi label={`Door openings (${rangeLabel})`} value={fleet.doorOpenings} note="carts and trucks" />
      <Kpi
        label="Lowest battery"
        value={low ? `${low.pct}%` : "–"}
        note={low ? `${deviceInfo(low.d.id).name} (on battery)` : "all units plugged in"}
        tone={low ? (low.pct < 20 ? "bad" : low.pct < 40 ? "warn" : "good") : "good"}
      />
      <Kpi label="Messages received" value={stats.received.toLocaleString()} note={`${missing} missing · ${stats.duplicates} duplicate · ${stats.rejected} rejected`} />
    </section>
  );
}

function Kpi({ label, value, note, tone }) {
  return (
    <div className={`kpi ${tone ? `kpi-${tone}` : ""}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {note && <div className="kpi-note">{note}</div>}
    </div>
  );
}
