import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Download, FileText, Keyboard, Monitor, OctagonAlert, X } from "lucide-react";
import { createFeed } from "./data/feed.js";
import { initialState, reducer } from "./data/store.js";
import { deviceInfo } from "./data/registry.js";
import { createMealPlan, mealPicture } from "./data/meals.js";
import { allAlerts, sortAlerts } from "./lib/alerts.js";
import { unitStatus } from "./lib/describe.js";
import { fmtTime, plural } from "./lib/format.js";
import { loadView, saveView } from "./lib/view.js";
import { usePref } from "./lib/prefs.js";
import { navigate, useRoute } from "./lib/router.js";
import { buildSnapshot } from "./lib/assistant.js";
import { RANGES } from "./components/UnitDetail.jsx";
import { NAV, SideNav, TopBar } from "./components/Shell.jsx";
import { MoreMenu, Toasts } from "./components/UI.jsx";
import { StatusIcon } from "./components/Badges.jsx";
import ChatPanel from "./components/ChatPanel.jsx";
import Home from "./pages/Home.jsx";
import Alerts from "./pages/Alerts.jsx";
import Find from "./pages/Find.jsx";
import Batches from "./pages/Batches.jsx";
import Storage from "./pages/Storage.jsx";
import Flights from "./pages/Flights.jsx";
import Reports from "./pages/Reports.jsx";
import Settings from "./pages/Settings.jsx";
import Control from "./pages/Control.jsx";
import Readings from "./pages/Readings.jsx";

const PAGES = { home: Home, alerts: Alerts, find: Find, batches: Batches, storage: Storage, devices: Storage, flights: Flights, control: Control, readings: Readings, reports: Reports, settings: Settings };
const RAW_KEEP = 400;
const isTyping = () => /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName ?? "");
const TOUR = [
  { page: "home", title: "This is where problems show up", text: "The banner at the top lists what needs attention, with a button to act on each one. When everything is fine it shrinks to one green line." },
  { page: "find", title: "This is how you find any meal", text: "Scan a batch label or type its code in the search box at the top, from any screen. You see where the meal has been and its temperature on the way." },
  { page: "alerts", title: "This is how you act on an alert", text: "Open an alert to see what happened, which meals are affected and what to do. When it's dealt with, press “Mark as fixed”." },
];
const SHORTCUTS = [
  ["/", "Search or scan"],
  ["A", "Open Alerts"],
  ["J / K", "Next / previous row in a list"],
  ["Enter", "Open the selected row"],
  ["Esc", "Close a panel or this help"],
  ["?", "Show this help"],
];

export default function App() {
  const feedRef = useRef(null);
  const rawRef = useRef({ n: 0, list: [] }); // latest raw messages, for the Sensor readings page
  if (!feedRef.current) feedRef.current = createFeed();
  const feed = feedRef.current;
  const [plan] = useState(() => createMealPlan(Math.floor(feed.now())));

  const [state, dispatch] = useReducer(reducer, initialState);
  const [now, setNow] = useState(() => feed.now());
  const [connection, setConnection] = useState(null);
  const [speed, setSpeed] = useState(() => feed.getSpeed?.());
  const [view, setViewState] = useState(loadView);
  const [theme, setTheme] = usePref("theme", "light");
  const [density, setDensity] = usePref("density", "comfortable");
  const [size, setSize] = usePref("size", "auto");
  const [handled, setHandled] = usePref("handled", {});
  const [recent, setRecent] = usePref("recent", []);
  const [tourDone, setTourDone] = usePref("tourDone", false);
  const [tourStep, setTourStep] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [resolved, setResolved] = useState([]);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const route = useRoute();
  const searchRef = useRef(null);
  const scanRef = useRef(null);
  const wall = route.page === "wall";

  useEffect(() => {
    const stop = feed.start((msgs) => {
      const at = feed.now();
      const raw = rawRef.current;
      raw.list = [...raw.list, ...msgs.filter((m) => m && typeof m === "object").map((msg) => ({ n: raw.n++, msg, at }))].slice(-RAW_KEEP);
      dispatch({ type: "messages", msgs });
    }, setConnection);
    const clock = setInterval(() => setNow(feed.now()), 1000);
    return () => {
      stop();
      clearInterval(clock);
    };
  }, [feed]);

  // ---------- Derived state ----------
  const ready = Object.keys(state.devices).length > 0;
  const deviceAlerts = useMemo(() => allAlerts(state.devices, now), [state.devices, now]);
  const picture = useMemo(() => mealPicture(plan, state.devices, deviceAlerts, now), [plan, state.devices, deviceAlerts, now]);
  const alerts = useMemo(() => sortAlerts([...deviceAlerts, ...picture.alerts]), [deviceAlerts, picture]);
  const deviceList = Object.values(state.devices).filter((d) => view.kinds[deviceInfo(d.id).kind] ?? true);
  const visibleIds = new Set(deviceList.map((d) => d.id));
  const shownAlerts = alerts.filter((a) => !a.deviceId || visibleIds.has(a.deviceId));
  const openAlerts = shownAlerts.filter((a) => !handled[a.id]);
  const handledAlerts = shownAlerts.filter((a) => handled[a.id]);
  const bellAlerts = openAlerts.filter((a) => a.severity !== "info");
  const actNow = bellAlerts.filter((a) => a.severity === "critical");

  // ---------- Toasts ----------
  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (t) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((list) => [...list.slice(-3), { ...t, id }]);
      setTimeout(() => dismiss(id), t.ms ?? 5000);
    },
    [dismiss],
  );

  // New "Act now" alerts interrupt (toast); alerts that end move to Resolved (DESIGN.md §8)
  const prevAlerts = useRef(null);
  useEffect(() => {
    if (!ready) return;
    const prev = prevAlerts.current;
    const cur = new Map(alerts.map((a) => [a.id, a]));
    if (prev) {
      const ended = [...prev.values()].filter((a) => !cur.has(a.id) && a.severity !== "info");
      if (ended.length) setResolved((r) => [...ended.map((a) => ({ ...a, endedAt: now })), ...r].slice(0, 50));
      for (const a of alerts) {
        if (!prev.has(a.id) && a.severity === "critical" && !handled[a.id]) {
          toast({ tone: "critical", icon: <OctagonAlert size={18} />, text: a.sentence, action: { label: "Open", run: () => navigate("alerts", null, { id: a.id }) }, ms: 8000 });
        }
      }
      // A handled alert that ended is cleared, so it shows again if it comes back
      const stale = Object.keys(handled).filter((id) => !cur.has(id));
      if (stale.length) setHandled((h) => Object.fromEntries(Object.entries(h).filter(([id]) => cur.has(id))));
    }
    prevAlerts.current = cur;
  }, [alerts]); // eslint-disable-line react-hooks/exhaustive-deps

  // Remember recently opened meals
  useEffect(() => {
    if (route.page === "find" && route.arg && plan.byCode[route.arg]) setRecent((r) => [route.arg, ...r.filter((c) => c !== route.arg)].slice(0, 6));
  }, [route.page, route.arg]); // eslint-disable-line react-hooks/exhaustive-deps

  // Phones show Alerts and Find only (DESIGN.md §4.3)
  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches && !NAV.find((n) => n.page === route.page)?.phone && route.page !== "wall") navigate("alerts", null, {}, { replace: true });
  }, [route]);

  // Theme, density and text size on <html>, so every token follows
  useEffect(() => {
    const el = document.documentElement;
    const t = wall ? "dark" : theme;
    if (t === "system") el.removeAttribute("data-theme");
    else el.setAttribute("data-theme", t);
    el.setAttribute("data-density", density);
    if (size === "auto") el.removeAttribute("data-size");
    else el.setAttribute("data-size", size);
  }, [theme, density, size, wall]);

  // ---------- Actions ----------
  const openUnit = useCallback((id) => navigate(route.page === "devices" ? "devices" : "storage", null, { unit: id }), [route.page]);
  const setView = (v) => {
    setViewState(v);
    saveView(v);
  };
  const markHandled = (a, note) => {
    setHandled((h) => ({ ...h, [a.id]: { at: now, note } }));
    toast({ text: "Marked as fixed. It moves to Handled.", action: { label: "Undo", run: () => setHandled((h) => Object.fromEntries(Object.entries(h).filter(([id]) => id !== a.id))) } });
  };
  const unhandle = (a) => setHandled((h) => Object.fromEntries(Object.entries(h).filter(([id]) => id !== a.id)));

  const source = feed.setSpeed ? `Simulated data (${speed === 0 ? "paused" : `${speed}× speed`})` : feed.label;
  const exportArgs = (rangeS = RANGES[1].s) => ({
    devices: deviceList,
    alerts: shownAlerts,
    stats: state.stats,
    now,
    rangeS,
    rangeLabel: RANGES.find((r) => r.s === rangeS)?.label ?? "",
    source,
    picture,
  });
  async function download(kind, rangeS) {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "excel") await (await import("./lib/export.js")).exportExcel(exportArgs(rangeS));
      else await (await import("./lib/report.js")).downloadReport(exportArgs(rangeS));
      toast({ text: kind === "excel" ? "Excel file downloaded" : "Report downloaded" });
    } catch (e) {
      console.error(e);
      setError(`Could not create the ${kind === "excel" ? "Excel file" : "report"}: ${e.message}. Try again, or use the other format.`);
    } finally {
      setBusy(null);
    }
  }
  const startTour = () => {
    setTourStep(0);
    navigate(TOUR[0].page);
  };

  // ---------- Keyboard: shortcuts and scans from a handheld scanner ----------
  useEffect(() => {
    const buf = { text: "", last: 0, fast: 0 };
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        setHelpOpen(false);
        return;
      }
      if (isTyping()) return;
      // Scanners type a whole code in a few milliseconds and finish with Enter
      const t = performance.now();
      if (e.key.length === 1) {
        if (t - buf.last < 40) buf.fast++;
        else {
          buf.text = "";
          buf.fast = 0;
        }
        buf.text += e.key;
        buf.last = t;
      }
      if (e.key === "Enter" && buf.text.length >= 6 && buf.fast >= buf.text.length - 2 && t - buf.last < 100) {
        e.preventDefault();
        scanRef.current?.(buf.text);
        buf.text = "";
        return;
      }
      if (buf.fast > 2) return; // in the middle of a scan
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "a" || e.key === "A") navigate("alerts");
      else if (e.key === "?") setHelpOpen((h) => !h);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const ctx = {
    now,
    ready,
    route,
    go: navigate,
    feed,
    plan,
    picture,
    devices: state.devices,
    rawMessages: rawRef.current.list,
    deviceList,
    deviceAlerts,
    alerts: shownAlerts,
    openAlerts,
    handledAlerts,
    handled,
    resolved,
    stats: state.stats,
    view,
    setView,
    recent,
    unitStatus: (d) => unitStatus(d, alerts, now),
    openUnit,
    toast,
    markHandled,
    unhandle,
    download,
    busy,
    error,
    prefs: { theme, density, size },
    setPref: (k, v) => ({ theme: setTheme, density: setDensity, size: setSize })[k](v),
    showHelp: () => setHelpOpen(true),
    startTour,
  };

  if (wall) return <Wall ctx={ctx} actNow={actNow} />;
  const Page = PAGES[route.page] ?? Home;

  const speedControl = feed.setSpeed && (
    <label className="speed" title="How fast the simulated data runs">
      <span className="hide-sm muted small">Simulation</span>
      <select
        value={speed}
        onChange={(e) => {
          const v = Number(e.target.value);
          feed.setSpeed(v);
          setSpeed(v);
          setNow(feed.now());
        }}
        aria-label="Simulation speed"
      >
        {feed.speeds.map((v) => (
          <option key={v} value={v}>
            {v === 0 ? "Paused" : `${v}× speed`}
          </option>
        ))}
      </select>
      <span className="clock" title="Simulated time">
        {fmtTime(now)}
      </span>
    </label>
  );

  return (
    <div className={`shell ${chatOpen ? "chat-on" : ""}`}>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <TopBar
        ctx={ctx}
        searchRef={searchRef}
        scanRef={scanRef}
        bellCount={bellAlerts.length}
        actNow={actNow.length > 0}
        chatOpen={chatOpen}
        onChat={() => setChatOpen((o) => !o)}
        speedControl={speedControl}
        more={
          <MoreMenu
            icon
            label="More"
            items={[
              { label: "Download report (PDF)", icon: FileText, onClick: () => download("report"), disabled: !!busy || !ready },
              { label: "Export Excel", icon: Download, onClick: () => download("excel"), disabled: !!busy || !ready },
              { label: "Keyboard shortcuts", icon: Keyboard, onClick: () => setHelpOpen(true) },
              { label: "Wall screen", icon: Monitor, hint: "for control rooms", onClick: () => navigate("wall") },
            ]}
          />
        }
      />
      {connection === "disconnected" && (
        <div className="conn-bar" role="alert">
          <StatusIcon status="offline" /> Lost connection to the server. Trying again… The numbers below may be out of date.
        </div>
      )}
      <SideNav page={route.page} go={(p) => navigate(p)} badge={bellAlerts.length} />
      <main id="main" className="content" tabIndex={-1}>
        <Page key={route.page} ctx={ctx} devicesPage={route.page === "devices"} />
      </main>

      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} getSnapshot={() => buildSnapshot(exportArgs())} />
      <Toasts toasts={toasts} onDismiss={dismiss} />

      {!tourDone && tourStep === null && ready && (
        <div className="tour-offer" role="dialog" aria-label="Tour">
          <p>
            <strong>New here?</strong> A 30-second tour shows where problems appear, how to find a meal and how to handle an alert.
          </p>
          <div className="row-gap">
            <button className="btn btn-primary btn-sm" onClick={startTour}>
              Take the tour
            </button>
            <button className="btn btn-quiet btn-sm" onClick={() => setTourDone(true)}>
              No thanks
            </button>
          </div>
        </div>
      )}
      {tourStep !== null && (
        <div className="tour-card" role="dialog" aria-label="Tour">
          <span className="muted small">
            Step {tourStep + 1} of {TOUR.length}
          </span>
          <h2>{TOUR[tourStep].title}</h2>
          <p>{TOUR[tourStep].text}</p>
          <div className="row-gap">
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                if (tourStep + 1 < TOUR.length) {
                  setTourStep(tourStep + 1);
                  navigate(TOUR[tourStep + 1].page);
                } else {
                  setTourStep(null);
                  setTourDone(true);
                  navigate("home");
                }
              }}
            >
              {tourStep + 1 < TOUR.length ? "Next" : "Done"}
            </button>
            <button
              className="btn btn-quiet btn-sm"
              onClick={() => {
                setTourStep(null);
                setTourDone(true);
              }}
            >
              End tour
            </button>
          </div>
        </div>
      )}

      {helpOpen && (
        <div className="modal-backdrop" onClick={() => setHelpOpen(false)}>
          <div className="modal" role="dialog" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}>
            <div className="panel-head">
              <h2>Keyboard shortcuts</h2>
              <button className="btn btn-quiet btn-icon" onClick={() => setHelpOpen(false)} aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <dl className="shortcuts">
              {SHORTCUTS.map(([k, v]) => (
                <div key={k}>
                  <dt>
                    {k.split(" / ").map((x, i) => (
                      <span key={x}>
                        {i > 0 && " / "}
                        <kbd className="kbd">{x}</kbd>
                      </span>
                    ))}
                  </dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <p className="muted small">A handheld barcode scanner works anywhere: scan a batch label and its page opens.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// Wall screen: Home and Alerts in turn, dark, no interaction needed (DESIGN.md §4.3, §8)
function Wall({ ctx, actNow }) {
  const [screen, setScreen] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setScreen((s) => (s + 1) % 2), 20000);
    const key = (e) => e.key === "Escape" && navigate("home");
    window.addEventListener("keydown", key);
    return () => {
      clearInterval(t);
      window.removeEventListener("keydown", key);
    };
  }, []);
  return (
    <div className="wall">
      {actNow.length > 0 && (
        <div className="wall-bar" role="alert">
          <OctagonAlert size={32} />
          <span>
            {actNow[0].sentence}
            {actNow.length > 1 && ` · and ${plural(actNow.length - 1, "more problem")}`}
          </span>
        </div>
      )}
      <div className="wall-head">
        <span className="brand-name">Meal Track &amp; Trace</span>
        <span className="muted">{screen === 0 ? "Overview" : "Open alerts"} · changes every 20 s</span>
        <span className="clock">{fmtTime(ctx.now)}</span>
        <button className="btn btn-quiet btn-sm" onClick={() => navigate("home")}>
          Exit wall screen (Esc)
        </button>
      </div>
      {screen === 0 ? (
        <Home ctx={ctx} wall />
      ) : (
        <div className="page">
          <ul className="alert-list wall-alerts">
            {ctx.openAlerts
              .filter((a) => a.severity !== "info")
              .map((a) => (
                <li key={a.id} className={`alert-row alert-${a.severity}`}>
                  <StatusIcon status={a.severity} size={28} />
                  <span className="alert-main">
                    <span className="alert-sentence">{a.sentence}</span>
                    <span className="alert-meta muted">{a.place}</span>
                  </span>
                </li>
              ))}
            {ctx.openAlerts.every((a) => a.severity === "info") && (
              <li className="allgood">
                <StatusIcon status="ok" size={28} /> All good. Nothing needs attention.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
