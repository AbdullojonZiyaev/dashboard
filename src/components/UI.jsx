import { useEffect, useRef, useState } from "react";
import { ChevronDown, Ellipsis, X } from "lucide-react";

// Slides in from the right: 480 px for forms, 720 px for details (DESIGN.md §6).
// Closes with ✕, Esc or a click outside. The list behind it stays where it was.
export function SidePanel({ open, onClose, title, subtitle, width = 720, children, actions, label }) {
  const closeRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="panel-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="panel" style={{ "--panel-w": `${width}px` }} role="dialog" aria-label={label ?? (typeof title === "string" ? title : "Details")}>
        <div className="panel-head">
          <div className="panel-title">
            {typeof title === "string" ? <h2>{title}</h2> : title}
            {subtitle && <div className="muted small">{subtitle}</div>}
          </div>
          <div className="panel-actions">
            {actions}
            <button ref={closeRef} className="btn btn-quiet btn-icon" onClick={onClose} aria-label="Close" title="Close (Esc)">
              <X size={20} />
            </button>
          </div>
        </div>
        <div className="panel-body">{children}</div>
      </aside>
    </>
  );
}

// Secondary actions live under "More" (DESIGN.md §2.4)
export function MoreMenu({ items, label = "More", icon = false, align = "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    const key = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button className={`btn ${icon ? "btn-quiet btn-icon" : "btn-secondary"}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" title={label}>
        {icon ? <Ellipsis size={20} /> : <>{label}</>}
        {!icon && <ChevronDown size={16} />}
      </button>
      {open && (
        <div className={`menu-list menu-${align}`} role="menu">
          {items.filter(Boolean).map((it) => (
            <button
              key={it.label}
              role="menuitem"
              className="menu-item"
              disabled={it.disabled}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
            >
              {it.icon && <it.icon size={18} aria-hidden="true" />}
              <span>
                {it.label}
                {it.hint && <span className="muted small menu-hint">{it.hint}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Summary tile: label, big number, small note. The whole tile is a button.
export function Tile({ label, value, note, tone, onClick }) {
  return (
    <button className={`tile ${tone ? `tile-${tone}` : ""}`} onClick={onClick} disabled={!onClick}>
      <span className="tile-label">{label}</span>
      <span className="tile-value">{value}</span>
      {note && <span className="tile-note">{note}</span>}
    </button>
  );
}

export function EmptyState({ children, action }) {
  return (
    <div className="empty-state">
      <p>{children}</p>
      {action}
    </div>
  );
}

// Grey placeholders in the shape of the real content (no full-page spinners)
export function Skeleton({ rows = 5, tiles = 0 }) {
  return (
    <div className="skeleton" aria-label="Loading" aria-busy="true">
      {tiles > 0 && (
        <div className="tiles">
          {Array.from({ length: tiles }, (_, i) => (
            <div key={i} className="sk sk-tile" />
          ))}
        </div>
      )}
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="sk sk-row" />
      ))}
    </div>
  );
}

// Bottom-left notes with Undo for 5 seconds (DESIGN.md §6)
export function Toasts({ toasts, onDismiss }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone ? `toast-${t.tone}` : ""}`}>
          {t.icon}
          <span className="toast-text">{t.text}</span>
          {t.action && (
            <button
              className="btn btn-quiet"
              onClick={() => {
                t.action.run();
                onDismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button className="btn btn-quiet btn-icon" onClick={() => onDismiss(t.id)} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

// Filter dropdown that reads like a button: "Status ▾"
export function FilterSelect({ label, value, options, onChange }) {
  return (
    <label className={`filter ${value ? "filter-on" : ""}`}>
      <span className="sr-only">{label}</span>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} aria-label={label}>
        <option value="">{label}: all</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {label}: {l}
          </option>
        ))}
      </select>
    </label>
  );
}

// Removable chips for the filters that are on, with "Clear all" (DESIGN.md §5.4)
export function FilterChips({ chips, onClear }) {
  if (!chips.length) return null;
  return (
    <div className="chips" aria-label="Active filters">
      {chips.map((c) => (
        <span key={c.key} className="chip chip-on">
          {c.label}
          <button onClick={c.remove} aria-label={`Remove filter ${c.label}`}>
            <X size={14} />
          </button>
        </span>
      ))}
      <button className="btn btn-quiet btn-sm" onClick={onClear}>
        Clear all
      </button>
    </div>
  );
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} className={v === value ? "active" : ""} aria-pressed={v === value} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}
