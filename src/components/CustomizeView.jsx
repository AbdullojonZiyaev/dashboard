import { DEFAULT_VIEW, VIEW_GROUPS } from "../lib/view.js";

// Choose which values the dashboard shows. Saved in this browser.
export default function CustomizeView({ view, onChange, groups }) {
  const toggle = (group, key) => onChange({ ...view, [group]: { ...view[group], [key]: !view[group][key] } });
  const setAll = (group, value) => onChange({ ...view, [group]: Object.fromEntries(Object.keys(view[group]).map((k) => [k, value])) });
  const shown = groups ? VIEW_GROUPS.filter((g) => groups.includes(g.key)) : VIEW_GROUPS;

  return (
    <div className="customize">
      {shown.map((g) => (
        <fieldset key={g.key} className="vgroup">
          <legend>
            {g.title}
            <span className="vgroup-actions">
              <button type="button" className="link" onClick={() => setAll(g.key, true)}>
                All
              </button>
              <button type="button" className="link" onClick={() => setAll(g.key, false)}>
                None
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
      <button type="button" className="btn btn-secondary" onClick={() => onChange(DEFAULT_VIEW)}>
        Reset to default
      </button>
    </div>
  );
}
