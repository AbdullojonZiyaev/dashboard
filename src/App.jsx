import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createFeed } from "./data/feed.js";
import { initialState, reducer } from "./data/store.js";
import { deviceInfo } from "./data/registry.js";
import { allAlerts } from "./lib/alerts.js";
import { fmtTimeSec } from "./lib/format.js";
import { fleetStats } from "./lib/stats.js";
import { loadView, saveView } from "./lib/view.js";
import { buildSnapshot } from "./lib/assistant.js";
import KpiStrip from "./components/KpiStrip.jsx";
import DeviceTable from "./components/DeviceTable.jsx";
import AlertsPanel from "./components/AlertsPanel.jsx";
import DeviceDetail, { RANGES } from "./components/DeviceDetail.jsx";
import Sidebar from "./components/Sidebar.jsx";
import ChatPanel from "./components/ChatPanel.jsx";

const wide = () => typeof window !== "undefined" && window.matchMedia("(min-width: 1100px)").matches;

export default function App() {
  const feedRef = useRef(null);
  if (!feedRef.current) feedRef.current = createFeed();
  const feed = feedRef.current;

  const [state, dispatch] = useReducer(reducer, initialState);
  const [now, setNow] = useState(() => feed.now());
  const [connection, setConnection] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [speed, setSpeed] = useState(() => feed.getSpeed?.());
  const [view, setView] = useState(loadView);
  const [sidebarOpen, setSidebarOpen] = useState(wide);
  const [chatOpen, setChatOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [range, setRange] = useState(RANGES[1].s);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const changeSpeed = (v) => {
    feed.setSpeed(v);
    setSpeed(v);
    setNow(feed.now());
  };
  const changeView = (v) => {
    setView(v);
    saveView(v);
  };

  useEffect(() => {
    const stop = feed.start((msgs) => dispatch({ type: "messages", msgs }), setConnection);
    const clock = setInterval(() => setNow(feed.now()), 1000);
    return () => {
      stop();
      clearInterval(clock);
    };
  }, [feed]);

  const rangeLabel = RANGES.find((r) => r.s === range)?.label ?? "";
  const alertsAll = useMemo(() => allAlerts(state.devices, now), [state.devices, now]);
  const allDevices = Object.values(state.devices);

  // Sidebar filters: unit types and alert levels
  const devices = allDevices.filter((d) => view.kinds[deviceInfo(d.id).kind] ?? true);
  const visibleIds = new Set(devices.map((d) => d.id));
  const alerts = alertsAll.filter((a) => visibleIds.has(a.deviceId) && view.severities[a.severity]);

  // Search box: unit name, assignment, device ID or sensor ID
  const q = query.trim().toLowerCase();
  const tableDevices = q
    ? devices.filter((d) => {
        const info = deviceInfo(d.id);
        return [info.name, info.assignment, info.kind, d.id, ...Object.keys(d.sensors)].some((s) => s.toLowerCase().includes(q));
      })
    : devices;

  const selected = state.devices[selectedId] && visibleIds.has(selectedId) ? state.devices[selectedId] : (tableDevices[0] ?? devices[0] ?? null);
  const fleet = useMemo(() => fleetStats(devices, now - range, now), [state.devices, now, range, view.kinds]); // eslint-disable-line react-hooks/exhaustive-deps
  const source = feed.setSpeed ? `Simulated data (${speed === 0 ? "paused" : `${speed}× speed`})` : feed.label;
  const exportArgs = () => ({ devices, alerts, stats: state.stats, now, rangeS: range, rangeLabel, source });

  async function run(kind, fn) {
    setBusy(kind);
    setError(null);
    try {
      await fn(exportArgs());
    } catch (e) {
      console.error(e);
      setError(`Could not create the ${kind === "excel" ? "Excel file" : "report"}: ${e.message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={`layout ${sidebarOpen ? "with-sidebar" : ""} ${chatOpen ? "with-chat" : ""}`}>
      <Sidebar view={view} onChange={changeView} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="app">
        <header className="topbar">
          <div className="title">
            <button className="btn" onClick={() => setSidebarOpen((o) => !o)} aria-expanded={sidebarOpen} title="Choose what the dashboard shows">
              ☰ View
            </button>
            <div>
              <h1>Cold-Chain Dashboard</h1>
              <p className="sub">Airline Ready-Meal Track &amp; Trace · read-only view</p>
            </div>
          </div>
          <div className="topbar-right">
            <button className="btn" onClick={() => run("excel", async (a) => (await import("./lib/export.js")).exportExcel(a))} disabled={!!busy || devices.length === 0}>
              {busy === "excel" ? "Preparing…" : "⬇ Export Excel"}
            </button>
            <button className="btn" onClick={() => run("report", async (a) => (await import("./lib/report.js")).downloadReport(a))} disabled={!!busy || devices.length === 0}>
              {busy === "report" ? "Preparing…" : "⬇ Download report (PDF)"}
            </button>
            <button className={`btn ${chatOpen ? "btn-primary" : ""}`} onClick={() => setChatOpen((o) => !o)} aria-expanded={chatOpen}>
              💬 Assistant
            </button>
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
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {view.sections.kpis && <KpiStrip devices={devices} alerts={alerts} stats={state.stats} fleet={fleet} rangeLabel={rangeLabel} now={now} />}

        {(view.sections.units || view.sections.alerts) && (
          <div className={`grid-top ${view.sections.units && view.sections.alerts ? "" : "single"}`}>
            {view.sections.units && (
              <DeviceTable
                devices={tableDevices}
                allCount={devices.length}
                alerts={alertsAll}
                now={now}
                selectedId={selected?.id}
                onSelect={setSelectedId}
                columns={view.columns}
                query={query}
                onQuery={setQuery}
              />
            )}
            {view.sections.alerts && <AlertsPanel alerts={alerts} now={now} onSelect={setSelectedId} />}
          </div>
        )}

        {view.sections.detail &&
          (selected ? (
            <DeviceDetail
              device={selected}
              devices={devices}
              onSelect={setSelectedId}
              alerts={alerts.filter((a) => a.deviceId === selected.id)}
              allAlerts={alertsAll}
              now={now}
              range={range}
              onRange={setRange}
              categories={view.categories}
            />
          ) : (
            <p className="empty">{allDevices.length ? "No units match the selected unit types." : "Waiting for the first message…"}</p>
          ))}
      </div>

      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} getSnapshot={() => buildSnapshot(exportArgs())} />
      {!chatOpen && (
        <button className="chat-fab" onClick={() => setChatOpen(true)} aria-label="Open assistant">
          💬
        </button>
      )}
    </div>
  );
}
