import { useEffect, useRef, useState } from "react";
import { Bell, Cpu, FileText, House, MessageCircle, Package, Plane, ScanLine, Search, Settings, Warehouse } from "lucide-react";
import { deviceInfo } from "../data/registry.js";
import { Code, StatusIcon } from "./Badges.jsx";

// Side navigation: at most 9 items, icon + word (DESIGN.md §4.1, §4.2)
export const NAV = [
  { page: "home", label: "Home", icon: House },
  { page: "alerts", label: "Alerts", icon: Bell, phone: true },
  { page: "find", label: "Find a meal", icon: ScanLine, phone: true },
  { page: "batches", label: "Batches", icon: Package },
  { page: "storage", label: "Storage", icon: Warehouse },
  { page: "flights", label: "Flights", icon: Plane },
  { page: "devices", label: "Devices", icon: Cpu },
  { page: "reports", label: "Reports", icon: FileText },
  { page: "settings", label: "Settings", icon: Settings },
];

export function SideNav({ page, go, badge }) {
  return (
    <nav className="sidenav" aria-label="Main">
      {NAV.map((n) => (
        <a
          key={n.page}
          href={`#/${n.page}`}
          className={`nav-item ${page === n.page ? "active" : ""} ${n.phone ? "on-phone" : ""}`}
          aria-current={page === n.page ? "page" : undefined}
          title={n.label}
          onClick={(e) => {
            e.preventDefault();
            go(n.page);
          }}
        >
          <n.icon size={20} aria-hidden="true" />
          <span className="nav-label">{n.label}</span>
          {n.page === "alerts" && badge > 0 && <span className="nav-count">{badge}</span>}
        </a>
      ))}
    </nav>
  );
}

// Match what was typed or scanned against batches, flights and units
export function searchAll(q, ctx) {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const out = [];
  for (const st of ctx.picture.list) {
    const b = st.batch;
    if (b.code.toLowerCase().includes(s) || b.meal.toLowerCase().includes(s) || (b.flightNo ?? "").toLowerCase().replace(" ", "").includes(s.replace(" ", "")))
      out.push({ type: "Meal", key: b.code, label: b.meal, code: b.code, note: st.place, status: st.status.key, exact: b.code.toLowerCase() === s, go: () => ctx.go("find", b.code) });
  }
  for (const f of ctx.picture.flights) {
    const no = f.flight.no.toLowerCase();
    if (no.includes(s) || no.replace(" ", "").includes(s.replace(" ", "")) || f.flight.dest.toLowerCase().includes(s))
      out.push({ type: "Flight", key: f.flight.no, label: `${f.flight.no} to ${f.flight.dest}`, note: f.readiness, status: f.status.key, exact: no === s || no.replace(" ", "") === s.replace(" ", ""), go: () => ctx.go("flights", null, { f: f.flight.no }) });
  }
  for (const d of Object.values(ctx.devices)) {
    const info = deviceInfo(d.id);
    if (info.name.toLowerCase().includes(s) || d.id.toLowerCase().includes(s) || Object.keys(d.sensors).some((k) => k.toLowerCase().includes(s)))
      out.push({ type: "Unit", key: d.id, label: info.name, note: info.assignment, status: ctx.unitStatus(d).key, exact: info.name.toLowerCase() === s || d.id === s, go: () => ctx.openUnit(d.id) });
  }
  return out.sort((a, b) => Number(b.exact) - Number(a.exact));
}

// Short confirmation sound for scans; silent if audio is unavailable
function beep(ok) {
  try {
    const ac = new AudioContext();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.frequency.value = ok ? 880 : 220;
    g.gain.value = 0.06;
    o.connect(g).connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + (ok ? 0.08 : 0.25));
    o.onended = () => ac.close();
  } catch {
    // no audio
  }
}

// One search box that also takes barcode / QR scans (DESIGN.md §4.1, §6 "Scan field")
export function GlobalSearch({ ctx, inputRef, scanRef }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [flash, setFlash] = useState(null);
  const results = searchAll(q, ctx).slice(0, 8);
  const boxRef = useRef(null);

  const finish = (ok, message) => {
    setFlash({ ok, message });
    beep(ok);
    setTimeout(() => setFlash(null), ok ? 900 : 3500);
  };
  const choose = (r) => {
    r.go();
    setQ("");
    setOpen(false);
    finish(true);
  };
  const submit = (text) => {
    const all = searchAll(text, ctx);
    const exact = all.find((r) => r.exact);
    if (exact) return choose(exact);
    if (all.length === 1) return choose(all[0]);
    if (all.length > 1) return ctx.go("find", null, { q: text.trim() });
    finish(false, `Nothing matches “${text.trim()}”. Check the label and try again.`);
  };
  // Scans typed while focus is elsewhere arrive here from App
  useEffect(() => {
    if (scanRef) scanRef.current = submit;
  });

  // Close the list after going somewhere
  useEffect(() => {
    setOpen(false);
  }, [ctx.route]);
  useEffect(() => {
    const close = (e) => !boxRef.current?.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div className={`gsearch ${flash ? (flash.ok ? "flash-ok" : "flash-bad") : ""}`} ref={boxRef}>
      <Search size={18} className="gsearch-icon" aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        value={q}
        placeholder="Search or scan a meal, flight or unit…"
        aria-label="Search or scan"
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setHi(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHi((h) => Math.min(results.length - 1, h + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((h) => Math.max(0, h - 1));
          } else if (e.key === "Enter" && q.trim()) {
            e.preventDefault();
            if (open && results[hi] && !results.some((r) => r.exact)) choose(results[hi]);
            else submit(q);
          } else if (e.key === "Escape") {
            setOpen(false);
            e.currentTarget.blur();
          }
        }}
      />
      <kbd className="kbd gsearch-kbd" aria-hidden="true">
        /
      </kbd>
      {flash && !flash.ok && (
        <div className="gsearch-msg" role="alert">
          {flash.message}
        </div>
      )}
      {open && q.trim() && !flash && (
        <ul className="gsearch-list" role="listbox">
          {results.map((r, i) => (
            <li key={`${r.type}${r.key}`} role="option" aria-selected={i === hi}>
              <button className={i === hi ? "hi" : ""} onMouseEnter={() => setHi(i)} onClick={() => choose(r)}>
                <StatusIcon status={r.status} />
                <span className="gs-type">{r.type}</span>
                <span className="gs-label">{r.label}</span>
                {r.code && <Code>{r.code}</Code>}
                <span className="muted small gs-note">{r.note}</span>
              </button>
            </li>
          ))}
          {results.length === 0 && <li className="muted gs-none">No meal, flight or unit matches. Press Enter to search anyway.</li>}
        </ul>
      )}
    </div>
  );
}

export function TopBar({ ctx, searchRef, scanRef, bellCount, actNow, onChat, chatOpen, speedControl, more }) {
  return (
    <header className="topbar">
      <a
        className="brand"
        href="#/home"
        onClick={(e) => {
          e.preventDefault();
          ctx.go("home");
        }}
      >
        <span className="brand-mark" aria-hidden="true">
          <ScanLine size={18} />
        </span>
        <span className="brand-name">Meal Track &amp; Trace</span>
      </a>
      <GlobalSearch ctx={ctx} inputRef={searchRef} scanRef={scanRef} />
      <div className="topbar-right">
        {speedControl}
        <button className={`btn btn-quiet ${chatOpen ? "is-on" : ""}`} onClick={onChat} aria-expanded={chatOpen} title="Ask the assistant">
          <MessageCircle size={20} />
          <span className="hide-sm">Assistant</span>
        </button>
        <button className={`btn btn-quiet bell ${actNow ? "bell-hot" : ""}`} onClick={() => ctx.go("alerts")} title={`${bellCount} open alerts`} aria-label={`Alerts: ${bellCount} open`}>
          <Bell size={20} />
          {bellCount > 0 && <span className="bell-count">{bellCount}</span>}
        </button>
        {more}
      </div>
    </header>
  );
}
