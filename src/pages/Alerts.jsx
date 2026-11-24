import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { batchesIn } from "../data/meals.js";
import { SEVERITY } from "../lib/describe.js";
import { fmtAgo, fmtDateTime, fmtSpan, plural } from "../lib/format.js";
import { Code, SeverityBadge, StatusBadge, StatusIcon } from "../components/Badges.jsx";
import { EmptyState, SidePanel, Skeleton } from "../components/UI.jsx";
import TempChart, { SERIES } from "../components/TempChart.jsx";
import { sensorLabel } from "../lib/alerts.js";

const NO_GROUP = new Set(["temp", "expired", "packing", "door", "expiring"]);
const FIXES = ["Moved the meals", "Closed the door", "Checked the temperature by hand", "Replaced or charged the battery", "Restarted or fixed the unit", "Discarded the batch", "Something else"];

// Similar alerts become one row: "Weak signal on 2 units" (DESIGN.md §8)
function group(list) {
  const out = [];
  const byKind = {};
  for (const a of list) {
    if (NO_GROUP.has(a.kind)) out.push({ one: a });
    else (byKind[a.kind] ??= []).push(a);
  }
  for (const items of Object.values(byKind)) {
    if (items.length === 1) out.push({ one: items[0] });
    else out.push({ group: items });
  }
  return out;
}

export default function Alerts({ ctx }) {
  const { now, route } = ctx;
  const [seen, setSeen] = useState(() => new Set(ctx.openAlerts.map((a) => a.id)));
  const firstLoad = seen.size === 0 && ctx.openAlerts.length > 0;
  useEffect(() => {
    if (firstLoad) setSeen(new Set(ctx.openAlerts.map((a) => a.id)));
  }, [firstLoad]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ctx.ready) return <Skeleton rows={6} />;

  const levels = ctx.view.severities;
  const open = ctx.openAlerts.filter((a) => levels[a.severity]);
  // Calm updates: new alerts wait behind a pill instead of making the list jump
  const fresh = open.filter((a) => !seen.has(a.id));
  const visible = seen.size === 0 ? open : open.filter((a) => seen.has(a.id));
  const handled = ctx.handledAlerts;
  const selected = route.params.id ? [...ctx.alerts, ...ctx.resolved].find((a) => a.id === route.params.id) : null;
  const openOne = (a) => ctx.go("alerts", null, { id: a.id });
  const hidden = Object.entries(levels).filter(([, on]) => !on);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Alerts</h1>
          <p className="muted">
            {open.length ? `${plural(open.length, "open alert")}, most urgent first.` : "No open alerts."}
            {hidden.length > 0 && ` Hiding ${hidden.map(([k]) => SEVERITY[k].label).join(", ")} (change in Settings).`}
          </p>
        </div>
      </div>

      {fresh.length > 0 && seen.size > 0 && (
        <button className="new-pill" onClick={() => setSeen(new Set(open.map((a) => a.id)))}>
          {plural(fresh.length, "new alert")} · Show
        </button>
      )}

      {open.length === 0 && <EmptyState>Nothing needs attention right now. That's good news.</EmptyState>}

      {["critical", "warning", "info"]
        .filter((sev) => levels[sev])
        .map((sev) => {
          const items = visible.filter((a) => a.severity === sev);
          if (!items.length) return null;
          return (
            <section key={sev} className="alert-section">
              <h2 className={`sec-title sec-${sev}`}>
                <StatusIcon status={sev} /> {SEVERITY[sev].label} <span className="count">{items.length}</span>
                <span className="muted small sec-meaning">{SEVERITY[sev].meaning}</span>
              </h2>
              <ul className="alert-list">
                {group(items).map((g) => (g.one ? <AlertRow key={g.one.id} a={g.one} now={now} onOpen={openOne} active={selected?.id === g.one.id} /> : <GroupRow key={g.group[0].kind} items={g.group} now={now} onOpen={openOne} />))}
              </ul>
            </section>
          );
        })}

      {handled.length > 0 && (
        <details className="alert-section folded">
          <summary>
            <ChevronRight size={16} className="fold-icon" /> Handled <span className="count">{handled.length}</span>
            <span className="muted small"> still active, but someone has dealt with them</span>
          </summary>
          <ul className="alert-list">
            {handled.map((a) => (
              <AlertRow key={a.id} a={a} now={now} onOpen={openOne} note={`Handled ${fmtAgo(ctx.handled[a.id].at, now)}: ${ctx.handled[a.id].note}`} />
            ))}
          </ul>
        </details>
      )}
      {ctx.resolved.length > 0 && (
        <details className="alert-section folded">
          <summary>
            <ChevronRight size={16} className="fold-icon" /> Resolved <span className="count">{ctx.resolved.length}</span>
            <span className="muted small"> the condition ended while the dashboard was open</span>
          </summary>
          <ul className="alert-list">
            {ctx.resolved.map((a) => (
              <AlertRow key={`${a.id}${a.endedAt}`} a={a} now={now} onOpen={openOne} note={`Ended ${fmtAgo(a.endedAt, now)}`} resolved />
            ))}
          </ul>
        </details>
      )}

      <SidePanel open={!!selected} onClose={() => ctx.go("alerts")} width={720} title={selected ? <AlertTitle a={selected} /> : ""} label="Alert details">
        {selected && <AlertDetail key={selected.id} a={selected} ctx={ctx} />}
      </SidePanel>
    </div>
  );
}

function AlertTitle({ a }) {
  return (
    <div className="alert-title">
      <SeverityBadge severity={a.severity} />
      <h2>{a.sentence}</h2>
    </div>
  );
}

function AlertRow({ a, now, onOpen, active, note, resolved }) {
  return (
    <li>
      <button className={`alert-row alert-${resolved ? "resolved" : a.severity} ${active ? "active" : ""}`} onClick={() => onOpen(a)}>
        <StatusIcon status={resolved ? "ok" : a.severity} size={20} />
        <span className="alert-main">
          <span className="alert-sentence">{a.sentence}</span>
          <span className="alert-meta muted small">
            {a.place}
            {a.since && (
              <>
                {" · "}
                <span title={fmtDateTime(a.since)}>started {fmtAgo(a.since, now)}</span>
              </>
            )}
            {note && <> · {note}</>}
          </span>
        </span>
        <ChevronRight size={18} className="muted" />
      </button>
    </li>
  );
}

function GroupRow({ items, now, onOpen }) {
  const [open, setOpen] = useState(false);
  const a = items[0];
  const units = [...new Set(items.map((x) => x.place))];
  return (
    <li className="group">
      <button className={`alert-row alert-${a.severity}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <StatusIcon status={a.severity} size={20} />
        <span className="alert-main">
          <span className="alert-sentence">
            {a.title} on {plural(units.length, "unit")}
          </span>
          <span className="alert-meta muted small">{units.join(", ")}</span>
        </span>
        <ChevronDown size={18} className={`muted fold ${open ? "is-open" : ""}`} />
      </button>
      {open && (
        <ul className="alert-list nested">
          {items.map((x) => (
            <AlertRow key={x.id} a={x} now={now} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </li>
  );
}

// What happened, a small chart, affected meals and the next steps (DESIGN.md §5.3)
function AlertDetail({ a, ctx }) {
  const { now, devices, picture } = ctx;
  const [fixing, setFixing] = useState(false);
  const [fix, setFix] = useState(FIXES[0]);
  const [note, setNote] = useState("");
  const d = a.deviceId ? devices[a.deviceId] : null;
  const from = now - 3600;
  const affected = a.batchCodes ? a.batchCodes.map((c) => picture.states[c]).filter(Boolean) : a.batchCode ? [picture.states[a.batchCode]].filter(Boolean) : d ? batchesIn(picture.list, d.id) : [];
  const handled = ctx.handled[a.id];
  const active = ctx.alerts.some((x) => x.id === a.id);
  const sensorIds = d ? Object.keys(d.sensors).filter((id) => !a.sensorId || id === a.sensorId) : [];

  return (
    <div className="alert-detail">
      <section>
        <h3>What happened</h3>
        <p>{a.detail}</p>
        <p className="muted small">
          {a.place}
          {a.since && ` · started ${fmtDateTime(a.since)} (${fmtSpan(now - a.since)} ago)`}
          {!active && " · this has ended"}
        </p>
      </section>

      {d && ["temp", "door", "offline", "heater", "crc"].includes(a.kind) && (
        <section>
          <h3>Last hour</h3>
          <TempChart
            data={d.history.filter((p) => p.ts >= from)}
            series={sensorIds.map((id, i) => ({ key: `t:${id}`, name: sensorLabel(d, id), color: SERIES[i % SERIES.length] }))}
            from={from}
            to={now}
            limits
            height={200}
          />
        </section>
      )}

      {affected.length > 0 && (
        <section>
          <h3>Affected meals</h3>
          <ul className="inside">
            {affected.map((s) => (
              <li key={s.batch.code}>
                <button className="row-link" onClick={() => ctx.go("find", s.batch.code)}>
                  <StatusBadge status={s.status} />
                  <span>
                    {s.batch.meal} · {s.batch.qty} meals
                  </span>
                  <Code>{s.batch.code}</Code>
                  <span className="muted small">{s.batch.flightNo ?? `missed ${s.batch.missedFlight}`}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {a.steps.length > 0 && (
        <section>
          <h3>What to do</h3>
          <ol className="steps">
            {a.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </section>
      )}

      <section className="detail-actions">
        {handled ? (
          <div className="handled-note">
            <StatusIcon status="ok" /> Marked as handled {fmtAgo(handled.at, now)}: {handled.note}
            <button className="btn btn-quiet btn-sm" onClick={() => ctx.unhandle(a)}>
              Undo
            </button>
          </div>
        ) : fixing ? (
          <form
            className="fix-form"
            onSubmit={(e) => {
              e.preventDefault();
              ctx.markHandled(a, note.trim() ? `${fix}. ${note.trim()}` : fix);
              setFixing(false);
            }}
          >
            <label className="field">
              <span className="field-label">What was done?</span>
              <select value={fix} onChange={(e) => setFix(e.target.value)}>
                {FIXES.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">
                Note <span className="muted">(optional)</span>
              </span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: moved to Trolley C-105" />
              <span className="field-hint">Saved in this browser only. Sharing with the team needs the backend.</span>
            </label>
            <div className="row-gap">
              <button className="btn btn-primary">Mark as fixed</button>
              <button type="button" className="btn btn-quiet" onClick={() => setFixing(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          active && (
            <button className="btn btn-primary" onClick={() => setFixing(true)}>
              Mark as fixed
            </button>
          )
        )}
        {d && (
          <button className="btn btn-secondary" onClick={() => ctx.openUnit(d.id)}>
            Open {a.place}
          </button>
        )}
        {a.flightNo && (
          <button className="btn btn-secondary" onClick={() => ctx.go("flights", null, { f: a.flightNo })}>
            Open {a.flightNo}
          </button>
        )}
        {a.kind === "expiring" && (
          <button className="btn btn-secondary" onClick={() => ctx.go("batches", null, { view: "expiring" })}>
            See the batches
          </button>
        )}
      </section>
    </div>
  );
}
