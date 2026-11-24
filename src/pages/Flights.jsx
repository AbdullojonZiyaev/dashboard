import { Check, Circle } from "lucide-react";
import { deviceInfo } from "../data/registry.js";
import { fmtDateTime, fmtTime, fmtUntil, plural } from "../lib/format.js";
import { setParams } from "../lib/router.js";
import { Code, StatusBadge } from "../components/Badges.jsx";
import DataTable from "../components/DataTable.jsx";
import { EmptyState, Segmented, SidePanel, Skeleton } from "../components/UI.jsx";

const RANK = { critical: 0, warning: 1, preparing: 2, ok: 3, departed: 4 };

// Which meals go on which flight, and is each flight ready? (DESIGN.md §1)
export default function Flights({ ctx }) {
  const { route, picture, now } = ctx;
  const p = route.params;
  if (!ctx.ready) return <Skeleton rows={8} />;
  const set = (patch) => setParams(route, patch);
  const show = p.show ?? "upcoming";
  const upcoming = picture.flights.filter((f) => !f.departed);
  const ready = upcoming.filter((f) => f.ready);
  // "Not ready" = needs attention now; flights still being prepared on schedule are not counted
  const notReady = upcoming.filter((f) => f.status.key === "critical" || f.status.key === "warning");
  const rows = show === "notready" ? notReady : show === "departed" ? picture.flights.filter((f) => f.departed) : upcoming;
  const sel = p.f ? picture.flights.find((f) => f.flight.no === p.f) : null;

  const columns = [
    { key: "no", label: "Flight", render: (f) => <Code>{f.flight.no}</Code>, sort: (f) => f.flight.no },
    { key: "dest", label: "To", render: (f) => f.flight.dest, sort: (f) => f.flight.dest },
    {
      key: "dep",
      label: "Departs",
      render: (f) => (
        <span title={fmtDateTime(f.flight.departs)}>
          <span className="strong">{fmtTime(f.flight.departs)}</span> <span className="muted small">{fmtUntil(f.flight.departs, now)}</span>
        </span>
      ),
      sort: (f) => f.flight.departs,
    },
    { key: "stand", label: "Stand", render: (f) => f.flight.stand },
    { key: "meals", label: "Meals", align: "right", render: (f) => f.meals, sort: (f) => f.meals },
    { key: "packed", label: "Packed", align: "right", render: (f) => `${f.packed} of ${f.total}`, sort: (f) => f.packed / f.total },
    { key: "ready", label: "Ready?", render: (f) => <span className={f.ready ? "" : f.status.key === "preparing" ? "muted" : "strong"}>{f.readiness}</span>, sort: (f) => Number(f.ready) },
    { key: "status", label: "Status", render: (f) => <StatusBadge status={f.status} />, sort: (f) => RANK[f.status.key] },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Flights</h1>
          <p className="muted">
            {upcoming.length
              ? `${ready.length} ready, ${notReady.length} need attention, ${upcoming.length - ready.length - notReady.length} still preparing on schedule.`
              : "No upcoming flights."}{" "}
            Meals must be packed on a trolley 3 hours before departure.
          </p>
        </div>
      </div>
      <div className="toolbar">
        <Segmented
          label="Show"
          value={show}
          onChange={(v) => set({ show: v === "upcoming" ? null : v })}
          options={[
            ["upcoming", `Upcoming (${upcoming.length})`],
            ["notready", `Not ready (${notReady.length})`],
            ["departed", "Departed"],
          ]}
        />
      </div>
      <section className="card flush">
        <DataTable
          label="Flights"
          columns={columns}
          rows={rows}
          rowKey={(f) => f.flight.no}
          onOpen={(f) => set({ f: f.flight.no })}
          activeKey={sel?.flight.no}
          defaultSort={{ key: "dep", dir: show === "departed" ? "desc" : "asc" }}
          rowClass={(f) => `row-${f.status.key}`}
          empty={show === "notready" ? "No flight needs attention. That's good news." : "No flights to show."}
        />
      </section>

      <SidePanel open={!!sel} onClose={() => set({ f: null })} width={720} label="Flight details" title={sel && <FlightTitle f={sel} />} subtitle={sel && `Departs ${fmtDateTime(sel.flight.departs)} (${fmtUntil(sel.flight.departs, now)}) · stand ${sel.flight.stand}`}>
        {sel && <FlightDetail f={sel} ctx={ctx} />}
      </SidePanel>
    </div>
  );
}

function FlightTitle({ f }) {
  return (
    <div className="alert-title">
      <h2>
        {f.flight.no} to {f.flight.dest}
      </h2>
      <StatusBadge status={f.status} />
    </div>
  );
}

function FlightDetail({ f, ctx }) {
  return (
    <div className="flight-detail">
      <p className="lead">{f.readiness}</p>
      <section>
        <h3>Checklist</h3>
        <ul className="checklist">
          {f.checklist.map((c) => (
            <li key={c.label} className={c.done ? "done" : ""}>
              {c.done ? <Check size={18} className="check-on" /> : <Circle size={18} className="check-off" />}
              <span>{c.label}</span>
              <span className="muted small">{c.note}</span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3>
          Meals for this flight <span className="count">{f.meals}</span>
        </h3>
        {f.batches.length ? (
          <ul className="inside">
            {f.batches.map((s) => (
              <li key={s.batch.code}>
                <button className="row-link" onClick={() => ctx.go("find", s.batch.code)}>
                  <StatusBadge status={s.status} />
                  <span>
                    {s.batch.meal} · {s.batch.qty} meals
                  </span>
                  <Code>{s.batch.code}</Code>
                  <span className="muted small">{s.place}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>No meals produced for this flight yet.</EmptyState>
        )}
        {f.produced < f.total && <p className="muted small">{plural(f.total - f.produced, "batch", "batches")} not produced yet.</p>}
      </section>
      <section>
        <h3>Equipment</h3>
        <div className="row-gap">
          <button className="btn btn-secondary" onClick={() => ctx.openUnit(f.flight.trolley)}>
            {deviceInfo(f.flight.trolley).name}
          </button>
          <button className="btn btn-secondary" onClick={() => ctx.openUnit(f.flight.truck)}>
            {deviceInfo(f.flight.truck).name}
          </button>
        </div>
      </section>
    </div>
  );
}
