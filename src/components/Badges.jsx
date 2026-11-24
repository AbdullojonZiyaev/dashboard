import { CircleCheck, CircleDashed, Info, OctagonAlert, TriangleAlert, Plane, Clock } from "lucide-react";
import { SEVERITY, SIGNAL_HELP, STATUS, freshness, signalInfo } from "../lib/describe.js";
import { fmtAgo, fmtDateTime, fmtNum } from "../lib/format.js";

// One icon per status, everywhere (DESIGN.md §3.1)
const ICONS = { ok: CircleCheck, warning: TriangleAlert, critical: OctagonAlert, offline: CircleDashed, info: Info, departed: Plane, preparing: Clock };

export function StatusIcon({ status, size = 16 }) {
  const Icon = ICONS[status] ?? Info;
  return <Icon size={size} strokeWidth={2.2} aria-hidden="true" className={`sicon sicon-${status}`} />;
}

// Rounded pill: icon + word + soft tint. Color is never the only signal.
export function StatusBadge({ status, size }) {
  return (
    <span className={`status status-${status.key} ${size === "lg" ? "status-lg" : ""}`} title={status.hint}>
      <StatusIcon status={status.key} size={size === "lg" ? 20 : 15} />
      {status.label}
    </span>
  );
}

export function SeverityBadge({ severity }) {
  const s = SEVERITY[severity];
  return <StatusBadge status={{ key: severity, label: s.label, hint: s.meaning }} />;
}

export const severityStatus = (sev) => (sev === "info" ? { key: "info", label: "Info" } : STATUS[sev]);

// "4.2 °C · 2 min ago". The "ago" turns amber when late and grey when gone,
// so people know whether to trust the number.
export function Reading({ value, ts, now, intervalS = 60, bad, unit = " °C", digits = 1 }) {
  const f = freshness(ts, intervalS, now);
  return (
    <span className="reading">
      <span className={`reading-value ${bad ? "tone-bad" : ""}`}>{fmtNum(value, digits, unit)}</span>
      {ts && (
        <span className={`reading-ago ago-${f}`} title={fmtDateTime(ts)}>
          {" "}
          · {fmtAgo(ts, now)}
        </span>
      )}
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
        <span>{info.label}</span>
        {!compact && (
          <span className="muted small">
            {" "}
            {rssi} dBm{type ? ` · ${type === "wifi" ? "Wi-Fi" : "Mobile"}` : ""}
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
      <span className="plug">{info.short}</span>
      <span className="batt" aria-hidden="true">
        <span className={`batt-fill fill-${info.tone}`} style={{ width: `${Math.max(4, info.pct)}%` }} />
      </span>
      <span className={info.tone === "bad" ? "tone-bad" : ""}>{info.pct}%</span>
    </span>
  );
}

export function InfoTip({ text }) {
  return (
    <span className="infotip" tabIndex={0} role="note" aria-label={text} data-tip={text}>
      ?
    </span>
  );
}

export const Code = ({ children }) => <span className="code">{children}</span>;
