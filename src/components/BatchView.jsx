import { Copy, Plane, Search } from "lucide-react";
import { deviceInfo } from "../data/registry.js";
import { batchSeries, batchState, batchTimeline } from "../data/meals.js";
import { outOfRange } from "../lib/alerts.js";
import { fmtDateTime, fmtSpan, fmtTemp, fmtTime, fmtUntil } from "../lib/format.js";
import { Code, Reading, StatusBadge, StatusIcon } from "./Badges.jsx";
import { EmptyState, MoreMenu } from "./UI.jsx";
import TempChart, { SERIES } from "./TempChart.jsx";

const STAGE_WORD = { kitchen: "In the kitchen", storage: "In cold storage", truck: "On a truck", aircraft: "On the aircraft", departed: "Departed" };

// Everything about one meal batch: where it is, where it has been, what to do (DESIGN.md §5.2)
export default function BatchView({ code, ctx, inPanel }) {
  const { plan, devices, now } = ctx;
  const b = plan.byCode[code];
  if (!b) return <EmptyState>No batch has the code “{code}”. Check the label, or pick the batch from the list.</EmptyState>;
  const s = ctx.picture.states[code] ?? batchState(b, devices, ctx.deviceAlerts, now);
  if (!s) return <EmptyState>{b.meal} ({code}) is planned but not produced yet. It will appear here once the kitchen registers it.</EmptyState>;

  const timeline = batchTimeline(b, devices, now);
  const series = batchSeries(b, devices, now);
  const from = series[0]?.ts ?? b.producedAt;
  const left = b.expiresAt - now;
  const expiryTone = left <= 0 ? "bad" : left < 6 * 3600 ? "warn" : "";
  const flight = ctx.picture.flights.find((f) => f.flight.no === b.flightNo);

  const primary = s.deviceId ? (
    <button className="btn btn-primary" onClick={() => ctx.openUnit(s.deviceId)}>
      Open {deviceInfo(s.deviceId).name}
    </button>
  ) : flight ? (
    <button className="btn btn-primary" onClick={() => ctx.go("flights", null, { f: flight.flight.no })}>
      Open {flight.flight.no}
    </button>
  ) : null;

  return (
    <div className={`batch ${inPanel ? "batch-panel" : ""}`}>
      <section className="card batch-head">
        <div className="batch-main">
          <div className="batch-title">
            <h2>{b.meal}</h2>
            <StatusBadge status={s.status} size="lg" />
          </div>
          <dl className="facts">
            <div>
              <dt>Batch</dt>
              <dd>
                <Code>{b.code}</Code>
              </dd>
            </div>
            <div>
              <dt>Quantity</dt>
              <dd>{b.qty} meals</dd>
            </div>
            <div>
              <dt>Where it is now</dt>
              <dd>
                {s.place}
                <div className="muted small">{STAGE_WORD[s.stage]}</div>
              </dd>
            </div>
            <div>
              <dt>Temperature</dt>
              <dd>{s.deviceId ? <Reading value={s.temp} ts={s.tempTs} now={now} intervalS={s.intervalS} bad={s.temp !== null && outOfRange(s.temp)} /> : <span className="muted">Not monitored here</span>}</dd>
            </div>
            <div>
              <dt>Expires</dt>
              <dd className={`tone-${expiryTone}`} title={fmtDateTime(b.expiresAt)}>
                {left > 0 ? `in ${fmtSpan(left)}` : `${fmtSpan(-left)} ago`}
                <div className="muted small">{fmtDateTime(b.expiresAt)}</div>
              </dd>
            </div>
            <div>
              <dt>Flight</dt>
              <dd>
                {b.flightNo ? (
                  <>
                    <Code>{b.flightNo}</Code> to {flight?.flight.dest ?? "–"}
                    <div className="muted small">Departs {fmtTime(b.flightDeparts)} ({fmtUntil(b.flightDeparts, now)})</div>
                  </>
                ) : (
                  <span className="tone-bad">Missed {b.missedFlight}</span>
                )}
              </dd>
            </div>
          </dl>
        </div>
        <div className="batch-actions">
          {primary}
          <MoreMenu
            items={[
              { label: "Copy batch code", icon: Copy, onClick: () => navigator.clipboard?.writeText(b.code).then(() => ctx.toast({ text: `Copied ${b.code}` })) },
              flight && s.deviceId && { label: `Open ${flight.flight.no}`, icon: Plane, onClick: () => ctx.go("flights", null, { f: flight.flight.no }) },
              { label: "Find another meal", icon: Search, onClick: () => ctx.go("find") },
            ]}
          />
        </div>
      </section>

      {s.problems.length > 0 && (
        <section className={`card todo todo-${s.status.key}`}>
          <h3>What to do</h3>
          <ul>
            {s.problems.map((p) => (
              <li key={p.text}>
                <StatusIcon status={p.severity} />
                <span>
                  <strong>{p.text}.</strong> {p.step}.
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="batch-grid">
        <section className="card">
          <h3>Journey</h3>
          <ol className="timeline">
            {timeline.map((t, i) => (
              <li key={`${t.ts}-${i}`} className={`tl tl-${t.type} tl-${t.type === "step" ? t.status : t.severity}`}>
                <span className="tl-dot" aria-hidden="true" />
                <div className="tl-body">
                  <div className="tl-line">
                    <span className="tl-label">{t.label}</span>
                    <span className="tl-time" title={fmtDateTime(t.ts)}>
                      {fmtTime(t.ts)}
                    </span>
                  </div>
                  <div className="tl-meta">
                    {t.type === "step" ? (
                      <>
                        <span>{t.place}</span>
                        {t.temp !== null && <span className={t.status === "critical" ? "tone-bad" : ""}>{fmtTemp(t.temp)}</span>}
                        <StatusIcon status={t.status} size={14} />
                      </>
                    ) : (
                      <>
                        <span>{t.detail}</span>
                        <StatusIcon status={t.severity} size={14} />
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <section className="card">
          <h3>Temperature on the way</h3>
          <TempChart data={series} series={[{ key: "t", name: "Warmest sensor", color: SERIES[0] }]} from={from} to={now} limits height={inPanel ? 220 : 260} />
          <p className="muted small">Each part of the journey uses the sensor of the trolley, truck or room the batch was in. The kitchen has no sensor in this prototype.</p>
        </section>
      </div>
    </div>
  );
}
