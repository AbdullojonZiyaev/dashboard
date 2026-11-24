import { ChevronRight } from "lucide-react";
import { deviceInfo } from "../data/registry.js";
import { STAGES, batchesIn } from "../data/meals.js";
import { outOfRange } from "../lib/alerts.js";
import { fmtAgo, plural } from "../lib/format.js";
import { Reading, StatusBadge, StatusIcon } from "../components/Badges.jsx";
import { Skeleton, Tile } from "../components/UI.jsx";

// What button an attention item gets, by alert kind
function attentionAction(a, ctx) {
  if (a.kind === "expiring") return { label: "See meals", run: () => ctx.go("batches", null, { view: "expiring" }) };
  if (a.batchCode) return { label: "See batch", run: () => ctx.go("find", a.batchCode) };
  if (a.flightNo) return { label: "See flight", run: () => ctx.go("flights", null, { f: a.flightNo }) };
  return { label: "Fix this", run: () => ctx.go("alerts", null, { id: a.id }) };
}

// Answers "Is everything OK?" in under 3 seconds (DESIGN.md §5.1)
export default function Home({ ctx, wall }) {
  const { now, picture, view } = ctx;
  if (!ctx.ready) return <Skeleton tiles={4} rows={4} />;

  const open = ctx.openAlerts.filter((a) => a.severity !== "info");
  const actNow = open.filter((a) => a.severity === "critical");
  const shown = open.slice(0, wall ? 5 : 4);
  const lastSeen = Math.max(...Object.values(ctx.devices).map((d) => d.lastTs ?? 0));

  const active = picture.list.filter((s) => !s.departed);
  const sum = (list) => list.reduce((a, s) => a + s.batch.qty, 0);
  const onTrucks = active.filter((s) => s.stage === "truck");
  const expiring = active.filter((s) => s.batch.expiresAt > now && s.batch.expiresAt - now < 6 * 3600);
  const upcoming = picture.flights.filter((f) => !f.departed && f.toGo < 6 * 3600);
  const ready = upcoming.filter((f) => f.ready);
  const needs = upcoming.filter((f) => f.status.key === "critical" || f.status.key === "warning");
  const preparing = upcoming.length - ready.length - needs.length;

  return (
    <div className="page home">
      {open.length ? (
        <section className={`attention attention-${actNow.length ? "critical" : "warning"}`} aria-label="Needs attention">
          <div className="attention-head">
            <StatusIcon status={actNow.length ? "critical" : "warning"} size={22} />
            <h2>{plural(open.length, "thing needs", "things need")} attention</h2>
            {!wall && (
              <button className="btn btn-quiet" onClick={() => ctx.go("alerts")}>
                View all <ChevronRight size={16} />
              </button>
            )}
          </div>
          <ul>
            {shown.map((a, i) => {
              const act = attentionAction(a, ctx);
              return (
                <li key={a.id} className={`att att-${a.severity}`}>
                  <StatusIcon status={a.severity} />
                  <span className="att-text">
                    {a.sentence}
                    {a.deviceId && a.kind === "temp" && batchesIn(picture.list, a.deviceId).length > 0 && (
                      <span className="muted"> · {plural(batchesIn(picture.list, a.deviceId).length, "batch", "batches")} inside</span>
                    )}
                  </span>
                  {!wall && (
                    <button className={`btn ${i === 0 ? "btn-primary" : "btn-secondary"} btn-sm`} onClick={act.run}>
                      {act.label}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {open.length > shown.length && <p className="muted small">and {open.length - shown.length} more in Alerts</p>}
        </section>
      ) : (
        <section className="allgood" aria-label="Status">
          <StatusIcon status="ok" size={20} /> <strong>All good.</strong> <span className="muted">Last checked {fmtAgo(lastSeen, now)}.</span>
        </section>
      )}

      {(view.sections.tiles || wall) && (
        <section className="tiles" aria-label="Summary">
          <Tile label="Open alerts" value={open.length} note={actNow.length ? `${actNow.length} act now` : "none need action now"} tone={actNow.length ? "bad" : ""} onClick={wall ? null : () => ctx.go("alerts")} />
          <Tile label="In transit" value={sum(onTrucks)} note={`meals on ${plural(new Set(onTrucks.map((s) => s.deviceId)).size, "truck")}`} onClick={wall ? null : () => ctx.go("batches", null, { stage: "truck" })} />
          <Tile label="Expiring soon" value={sum(expiring)} note={`meals in under 6 h · ${plural(expiring.length, "batch", "batches")}`} tone={expiring.length ? "warn" : ""} onClick={wall ? null : () => ctx.go("batches", null, { view: "expiring" })} />
          <Tile label="Flights ready" value={`${ready.length} of ${upcoming.length}`} note={`next 6 h · ${needs.length} need attention · ${preparing} preparing`} tone={needs.length ? "warn" : ""} onClick={wall ? null : () => ctx.go("flights")} />
        </section>
      )}

      {(view.sections.journey || wall) && (
        <section className="card journey" aria-label="Where meals are now">
          <h2>Where meals are now</h2>
          <ol className="journey-strip">
            {STAGES.map((st) => {
              const here = active.filter((s) => s.stage === st.key);
              const bad = here.filter((s) => s.status.key === "critical" || s.status.key === "offline");
              const warn = here.filter((s) => s.status.key === "warning");
              return (
                <li key={st.key}>
                  <button className="stage" onClick={wall ? undefined : () => ctx.go("batches", null, { stage: st.key })} disabled={wall}>
                    <span className="stage-label">{st.label}</span>
                    <span className="stage-value">{sum(here)}</span>
                    <span className="muted small">{plural(here.length, "batch", "batches")}</span>
                    <span className="stage-flags">
                      {bad.length > 0 && (
                        <span className="flag flag-critical">
                          <StatusIcon status="critical" size={14} /> {bad.length}
                        </span>
                      )}
                      {warn.length > 0 && (
                        <span className="flag flag-warning">
                          <StatusIcon status="warning" size={14} /> {warn.length}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {view.sections.units && !wall && (
        <section className="card" aria-label="Storage at a glance">
          <div className="card-head">
            <h2>Storage at a glance</h2>
            <button className="btn btn-quiet" onClick={() => ctx.go("storage")}>
              Open Storage <ChevronRight size={16} />
            </button>
          </div>
          <div className="glance">
            {ctx.deviceList.map((d) => {
              const st = ctx.unitStatus(d);
              const temps = Object.values(d.sensors).map((s) => s.temp_c).filter(Number.isFinite);
              const t = temps.length ? Math.max(...temps) : null;
              const inside = batchesIn(picture.list, d.id);
              return (
                <button key={d.id} className={`glance-item glance-${st.key}`} onClick={() => ctx.openUnit(d.id)}>
                  <span className="glance-top">
                    <span className="glance-name">{deviceInfo(d.id).name}</span>
                    <StatusBadge status={st} />
                  </span>
                  <Reading value={t} ts={d.lastTs} now={now} intervalS={d.intervalS} bad={t !== null && outOfRange(t)} />
                  <span className="muted small">{inside.length ? `${inside.reduce((a, s) => a + s.batch.qty, 0)} meals inside` : "Empty"}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
