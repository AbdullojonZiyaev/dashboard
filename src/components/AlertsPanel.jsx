import { useState } from "react";
import { SEVERITY } from "../lib/describe.js";
import { fmtAgo } from "../lib/format.js";
import { SeverityBadge } from "./Badges.jsx";

export default function AlertsPanel({ alerts, now, onSelect }) {
  const [only, setOnly] = useState(null);
  const counts = Object.fromEntries(Object.keys(SEVERITY).map((k) => [k, alerts.filter((a) => a.severity === k).length]));
  const shown = only ? alerts.filter((a) => a.severity === only) : alerts;

  return (
    <section className="card alerts">
      <div className="card-head">
        <h2>
          Alerts <span className="count">{alerts.length}</span>
        </h2>
      </div>
      <div className="sev-filter" role="group" aria-label="Filter alerts by level">
        {Object.entries(SEVERITY).map(([k, s]) => (
          <button
            key={k}
            className={`sev-chip sev-chip-${k} ${only === k ? "active" : ""}`}
            onClick={() => setOnly(only === k ? null : k)}
            title={s.meaning}
          >
            <b>{counts[k]}</b> {s.label}
            <span className="sev-meaning">{s.meaning}</span>
          </button>
        ))}
      </div>
      {shown.length === 0 && <p className="muted">No active alerts{only ? ` at ${SEVERITY[only].label} level` : ""}.</p>}
      <ul>
        {shown.map((a) => (
          <li key={a.id} className={`alert alert-${a.severity}`} onClick={() => onSelect(a.deviceId)}>
            <div className="alert-head">
              <SeverityBadge severity={a.severity} />
              <span className="alert-title">{a.title}</span>
              <span className="muted small alert-since">{a.since ? `since ${fmtAgo(a.since, now)}` : ""}</span>
            </div>
            <div className="small">
              <strong>{a.device}</strong> · {a.detail}
            </div>
          </li>
        ))}
      </ul>
      <p className="muted small note">Click an alert to open the unit. Escalation to the food safety manager is not part of this prototype.</p>
    </section>
  );
}
