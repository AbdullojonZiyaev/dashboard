import { DEFAULT_VIEW, VIEW_GROUPS } from "../lib/view.js";

export default function Sidebar({ view, onChange, open, onClose }) {
  const toggle = (group, key) => onChange({ ...view, [group]: { ...view[group], [key]: !view[group][key] } });
  const setAll = (group, value) =>
    onChange({ ...view, [group]: Object.fromEntries(Object.keys(view[group]).map((k) => [k, value])) });

  return (
    <aside className={`sidebar ${open ? "open" : ""}`} aria-label="View options">
      <div className="sidebar-head">
        <h2>View</h2>
        <button className="btn btn-ghost sidebar-close" onClick={onClose} aria-label="Close view options">
          ✕
        </button>
      </div>
      <p className="muted small">Choose what the dashboard shows. Saved in this browser.</p>
      {VIEW_GROUPS.map((g) => (
        <fieldset key={g.key} className="vgroup">
          <legend>
            {g.title}
            <span className="vgroup-actions">
              <button className="link" onClick={() => setAll(g.key, true)}>
                all
              </button>
              <button className="link" onClick={() => setAll(g.key, false)}>
                none
              </button>
            </span>
          </legend>
          {g.items.map(([key, label]) => (
            <label key={key} className="check">
              <input type="checkbox" checked={!!view[g.key][key]} onChange={() => toggle(g.key, key)} />
              {label}
            </label>
          ))}
        </fieldset>
      ))}
      <button className="btn" onClick={() => onChange(DEFAULT_VIEW)}>
        Reset to default
      </button>
    </aside>
  );
}
