import { fmtAgo } from "../lib/format.js";

export default function AlertsPanel({ alerts, now, onSelect }) {
  return (
    <section className="card alerts">
      <h2>
        Alerts <span className="count">{alerts.length}</span>
      </h2>
      {alerts.length === 0 && <p className="muted">No active alerts.</p>}
      <ul>
        {alerts.map((a) => (
          <li key={a.id} className={`alert alert-${a.severity}`} onClick={() => onSelect(a.deviceId)}>
            <div className="alert-head">
              <span className="alert-title">{a.title}</span>
              <span className="muted small">{a.since ? `since ${fmtAgo(a.since, now)}` : ""}</span>
            </div>
            <div className="small">
              <strong>{a.device}</strong> · {a.detail}
            </div>
          </li>
        ))}
      </ul>
      <p className="muted small note">Escalation to the food safety manager is not part of this prototype.</p>
    </section>
  );
}
