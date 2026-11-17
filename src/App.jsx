import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createFeed } from "./data/feed.js";
import { initialState, reducer } from "./data/store.js";
import { allAlerts } from "./lib/alerts.js";
import { fmtTimeSec } from "./lib/format.js";
import KpiStrip from "./components/KpiStrip.jsx";
import DeviceTable from "./components/DeviceTable.jsx";
import AlertsPanel from "./components/AlertsPanel.jsx";
import DeviceDetail from "./components/DeviceDetail.jsx";

export default function App() {
  const feedRef = useRef(null);
  if (!feedRef.current) feedRef.current = createFeed();
  const feed = feedRef.current;

  const [state, dispatch] = useReducer(reducer, initialState);
  const [now, setNow] = useState(() => feed.now());
  const [connection, setConnection] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [speed, setSpeed] = useState(() => feed.getSpeed?.());

  const changeSpeed = (v) => {
    feed.setSpeed(v);
    setSpeed(v);
    setNow(feed.now());
  };

  useEffect(() => {
    const stop = feed.start((msgs) => dispatch({ type: "messages", msgs }), setConnection);
    const clock = setInterval(() => setNow(feed.now()), 1000);
    return () => {
      stop();
      clearInterval(clock);
    };
  }, [feed]);

  const alerts = useMemo(() => allAlerts(state.devices, now), [state.devices, now]);
  const devices = Object.values(state.devices);
  const selected = state.devices[selectedId] ?? devices[0] ?? null;

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Cold-Chain Dashboard</h1>
          <p className="sub">Airline Ready-Meal Track &amp; Trace · read-only view</p>
        </div>
        <div className="topbar-right">
          <span className={`badge ${connection === "disconnected" ? "badge-bad" : ""}`}>
            {feed.label}
            {connection ? ` · ${connection}` : ""}
          </span>
          {feed.setSpeed && (
            <div className="range speed" role="group" aria-label="Simulation speed">
              <span className="muted small">Speed</span>
              {feed.speeds.map((v) => (
                <button key={v} className={v === speed ? "active" : ""} onClick={() => changeSpeed(v)}>
                  {v === 0 ? "Pause" : `${v}×`}
                </button>
              ))}
            </div>
          )}
          <span className="clock">{fmtTimeSec(now)}</span>
        </div>
      </header>

      <KpiStrip devices={devices} alerts={alerts} stats={state.stats} now={now} />

      <div className="grid-top">
        <DeviceTable devices={devices} alerts={alerts} now={now} selectedId={selected?.id} onSelect={setSelectedId} />
        <AlertsPanel alerts={alerts} now={now} onSelect={setSelectedId} />
      </div>

      {selected ? (
        <DeviceDetail device={selected} alerts={alerts.filter((a) => a.deviceId === selected.id)} now={now} />
      ) : (
        <p className="empty">Waiting for the first message…</p>
      )}
    </div>
  );
}
