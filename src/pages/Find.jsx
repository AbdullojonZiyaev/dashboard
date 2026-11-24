import { useState } from "react";
import { ChevronLeft, ScanLine } from "lucide-react";
import { searchAll } from "../components/Shell.jsx";
import { Code, StatusBadge, StatusIcon } from "../components/Badges.jsx";
import BatchView from "../components/BatchView.jsx";
import { EmptyState, Skeleton } from "../components/UI.jsx";
import { fmtUntil } from "../lib/format.js";

// Find a meal: scan or type, or pick from recent and current batches (DESIGN.md §5.2, §2.7)
export default function Find({ ctx }) {
  const { route, picture, now } = ctx;
  const [q, setQ] = useState(route.params.q ?? "");
  if (!ctx.ready) return <Skeleton rows={6} />;

  if (route.arg) {
    return (
      <div className="page">
        <button className="btn btn-quiet back" onClick={() => history.back()}>
          <ChevronLeft size={18} /> Back
        </button>
        <BatchView code={route.arg} ctx={ctx} />
      </div>
    );
  }

  const results = q.trim() ? searchAll(q, ctx).filter((r) => r.type === "Meal") : [];
  const recent = ctx.recent.map((c) => picture.states[c]).filter(Boolean);
  const active = picture.list.filter((s) => !s.departed).sort((a, b) => (a.batch.flightDeparts ?? 0) - (b.batch.flightDeparts ?? 0));

  const BatchItem = ({ s }) => (
    <li>
      <button className="row-link" onClick={() => ctx.go("find", s.batch.code)}>
        <StatusBadge status={s.status} />
        <span className="strong">{s.batch.meal}</span>
        <Code>{s.batch.code}</Code>
        <span className="muted small">
          {s.place}
          {s.batch.flightNo ? ` · ${s.batch.flightNo} ${fmtUntil(s.batch.flightDeparts, now)}` : ""}
        </span>
      </button>
    </li>
  );

  return (
    <div className="page find">
      <div className="page-head">
        <div>
          <h1>Find a meal</h1>
          <p className="muted">Scan the batch label, or type the batch code, meal or flight.</p>
        </div>
      </div>
      <form
        className="scanbox"
        onSubmit={(e) => {
          e.preventDefault();
          const exact = searchAll(q, ctx).find((r) => r.exact && r.type === "Meal");
          if (exact) exact.go();
          else ctx.go("find", null, { q: q.trim() }, { replace: true });
        }}
      >
        <ScanLine size={28} aria-hidden="true" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Scan or type, for example B-2611-0383" aria-label="Batch code, meal or flight" autoFocus />
        <button className="btn btn-primary">Find</button>
      </form>

      {q.trim() && (
        <section className="card">
          <h2>Matches</h2>
          {results.length ? (
            <ul className="pick">
              {results.map((r) => (
                <BatchItem key={r.key} s={picture.states[r.key]} />
              ))}
            </ul>
          ) : (
            <EmptyState>No meal matches “{q.trim()}”. Check the code on the label, or pick the batch below.</EmptyState>
          )}
        </section>
      )}

      <div className="two-col">
        <section className="card">
          <h2>Recently opened</h2>
          {recent.length ? (
            <ul className="pick">
              {recent.map((s) => (
                <BatchItem key={s.batch.code} s={s} />
              ))}
            </ul>
          ) : (
            <EmptyState>Scan a meal's label to see where it has been. The meals you open show up here.</EmptyState>
          )}
        </section>
        <section className="card">
          <h2>
            Meals on the ground now <span className="count">{active.length}</span>
          </h2>
          <ul className="pick">
            {active.map((s) => (
              <BatchItem key={s.batch.code} s={s} />
            ))}
          </ul>
          <p className="muted small">
            <StatusIcon status="info" size={14} /> Sorted by flight departure.
          </p>
        </section>
      </div>
    </div>
  );
}
