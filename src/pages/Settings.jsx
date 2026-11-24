import { Keyboard, Monitor, Route as RouteIcon } from "lucide-react";
import { LIMITS } from "../config.js";
import CustomizeView from "../components/CustomizeView.jsx";
import { Segmented } from "../components/UI.jsx";

export default function Settings({ ctx }) {
  const { prefs, setPref, feed } = ctx;
  return (
    <div className="page settings">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="muted">Saved in this browser.</p>
        </div>
      </div>
      <div className="two-col">
        <section className="card">
          <h2>Appearance</h2>
          <div className="setting">
            <span className="setting-label">Theme</span>
            <Segmented label="Theme" value={prefs.theme} onChange={(v) => setPref("theme", v)} options={[["light", "Light"], ["dark", "Dark"], ["system", "Match device"]]} />
          </div>
          <div className="setting">
            <span className="setting-label">Table rows</span>
            <Segmented label="Table rows" value={prefs.density} onChange={(v) => setPref("density", v)} options={[["comfortable", "Comfortable"], ["compact", "Compact"]]} />
          </div>
          <div className="setting">
            <span className="setting-label">
              Text and buttons
              <span className="muted small"> Large is for tablets on the floor</span>
            </span>
            <Segmented label="Text size" value={prefs.size} onChange={(v) => setPref("size", v)} options={[["auto", "Automatic"], ["normal", "Normal"], ["large", "Large"]]} />
          </div>
          <h2>Help</h2>
          <div className="row-gap">
            <button className="btn btn-secondary" onClick={ctx.showHelp}>
              <Keyboard size={18} /> Keyboard shortcuts
            </button>
            <button className="btn btn-secondary" onClick={ctx.startTour}>
              <RouteIcon size={18} /> Take the tour
            </button>
            <button className="btn btn-secondary" onClick={() => ctx.go("wall")}>
              <Monitor size={18} /> Open wall screen
            </button>
          </div>
          <h2>About the data</h2>
          <ul className="plain">
            <li>Data source: {feed.label}</li>
            <li>
              Safe temperature range: {LIMITS.tempMinC}–{LIMITS.tempMaxC} °C. A placeholder until the approved HACCP plan sets the limits.
            </li>
            <li>Meal batches and flights are simulated in this prototype. In the real system they come from the backend.</li>
          </ul>
        </section>
        <section className="card">
          <h2>What the dashboard shows</h2>
          <CustomizeView view={ctx.view} onChange={ctx.setView} />
        </section>
      </div>
    </div>
  );
}
