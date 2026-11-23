import { SEVERITY, SIGNAL_HELP, signalInfo } from "../lib/describe.js";

export function StatusBadge({ status }) {
  return (
    <span className={`status status-${status.key}`} title={status.hint}>
      <span className="status-icon" aria-hidden="true">
        {status.icon}
      </span>
      {status.label}
    </span>
  );
}

export function SeverityBadge({ severity }) {
  const s = SEVERITY[severity];
  return (
    <span className={`sev sev-${severity}`} title={s.meaning}>
      <span className="status-icon" aria-hidden="true">
        {s.icon}
      </span>
      {s.label}
    </span>
  );
}

export function Signal({ rssi, type, compact }) {
  const info = signalInfo(rssi);
  return (
    <span className="signal" title={`${rssi} dBm · ${info.label}. ${SIGNAL_HELP}`}>
      <span className={`bars tone-${info.tone}`} aria-hidden="true">
        {[1, 2, 3, 4].map((b) => (
          <i key={b} className={b <= info.bars ? "on" : ""} style={{ height: 3 + b * 3 }} />
        ))}
      </span>
      <span>
        <span className={`tone-${info.tone}`}>{info.label}</span>
        {!compact && (
          <span className="muted small">
            {" "}
            {rssi} dBm{type ? ` · ${type === "wifi" ? "Wi-Fi" : "Cellular"}` : ""}
          </span>
        )}
      </span>
    </span>
  );
}

export function Battery({ info }) {
  if (info.pct === null) return <span className="muted">{info.label}</span>;
  return (
    <span className="battery" title={info.label}>
      <span className={`plug plug-${info.source === "Mains" ? "mains" : "battery"}`}>{info.short}</span>
      <span className="batt" aria-hidden="true">
        <span className={`batt-fill tone-bg-${info.tone}`} style={{ width: `${Math.max(4, info.pct)}%` }} />
      </span>
      <span className={`tone-${info.tone}`}>{info.pct}%</span>
    </span>
  );
}

export function InfoTip({ text }) {
  return (
    <span className="infotip" tabIndex={0} aria-label={text} data-tip={text}>
      ?
    </span>
  );
}
