import { isOffline } from "../lib/alerts.js";

export default function KpiStrip({ devices, alerts, stats, now }) {
  const online = devices.filter((d) => !isOffline(d, now)).length;
  const critical = alerts.filter((a) => a.severity === "critical").length;
  const warning = alerts.filter((a) => a.severity === "warning").length;
  const excursions = alerts.filter((a) => a.title === "Temperature excursion").length;
  const missing = devices.reduce((n, d) => n + d.missing.size, 0);

  return (
    <section className="kpis">
      <Kpi label="Devices online" value={`${online} / ${devices.length}`} tone={online < devices.length ? "bad" : "good"} />
      <Kpi label="Temperature excursions" value={excursions} tone={excursions ? "bad" : "good"} />
      <Kpi label="Active alerts" value={critical + warning} note={`${critical} critical · ${warning} warning`} tone={critical ? "bad" : warning ? "warn" : "good"} />
      <Kpi
        label="Messages received"
        value={stats.received.toLocaleString()}
        note={`${missing} missing · ${stats.duplicates} duplicate · ${stats.rejected} rejected`}
      />
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
