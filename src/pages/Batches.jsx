import { useState } from "react";
import { Download, X } from "lucide-react";
import { STAGES } from "../data/meals.js";
import { outOfRange } from "../lib/alerts.js";
import { STATUS } from "../lib/describe.js";
import { fmtDateTime, fmtSpan, fmtTime, fmtUntil, plural } from "../lib/format.js";
import { setParams } from "../lib/router.js";
import { Code, Reading, StatusBadge } from "../components/Badges.jsx";
import DataTable from "../components/DataTable.jsx";
import BatchView from "../components/BatchView.jsx";
import { FilterChips, FilterSelect, SidePanel, Skeleton } from "../components/UI.jsx";

const VIEWS = [
  ["all", "All"],
  ["act", "Act now"],
  ["expiring", "Expiring soon"],
  ["truck", "In transit"],
  ["departed", "Departed"],
];
const STATUS_RANK = { critical: 0, offline: 1, warning: 2, ok: 3, departed: 4 };
const STAGE_LABEL = { ...Object.fromEntries(STAGES.map((s) => [s.key, s.label])), departed: "Departed" };

// The shared management-list pattern (DESIGN.md §5.4)
export default function Batches({ ctx }) {
  const { route, picture, now } = ctx;
  const p = route.params;
  const [selected, setSelected] = useState(() => new Set());
  if (!ctx.ready) return <Skeleton rows={8} />;
  const set = (patch) => setParams(route, patch);

  const flights = [...new Set(picture.list.map((s) => s.batch.flightNo).filter(Boolean))].sort();
  const q = (p.q ?? "").trim().toLowerCase();
  const view = p.view ?? "all";
  const rows = picture.list.filter((s) => {
    const b = s.batch;
    const wantDeparted = view === "departed" || p.stage === "departed";
    if (s.departed !== wantDeparted) return false;
    if (view === "act" && !["critical", "offline"].includes(s.status.key)) return false;
    if (view === "expiring" && b.expiresAt - now >= 6 * 3600) return false;
    if (view === "truck" && s.stage !== "truck") return false;
    if (p.status && s.status.key !== p.status) return false;
    if (p.stage && s.stage !== p.stage) return false;
    if (p.flight && b.flightNo !== p.flight) return false;
    if (q && ![b.code, b.meal, b.flightNo ?? "", s.place].some((x) => x.toLowerCase().includes(q))) return false;
    return true;
  });

  const chips = [
    p.q && { key: "q", label: `“${p.q}”`, remove: () => set({ q: null }) },
    p.status && { key: "status", label: `Status: ${STATUS[p.status]?.label ?? p.status}`, remove: () => set({ status: null }) },
    p.stage && { key: "stage", label: `Where: ${STAGE_LABEL[p.stage]}`, remove: () => set({ stage: null }) },
    p.flight && { key: "flight", label: `Flight: ${p.flight}`, remove: () => set({ flight: null }) },
  ].filter(Boolean);

  const exportRows = async (list, label) => {
    const { exportBatches } = await import("../lib/export.js");
    await exportBatches({ states: list, now, label });
    ctx.toast({ text: `Exported ${plural(list.length, "batch", "batches")} to Excel` });
  };
  const chosen = rows.filter((s) => selected.has(s.batch.code));
  const open = p.sel && ctx.plan.byCode[p.sel] ? p.sel : null;

  const columns = [
    { key: "code", label: "Batch", render: (s) => <Code>{s.batch.code}</Code>, sort: (s) => s.batch.code },
    { key: "meal", label: "Meal", render: (s) => <span className="strong">{s.batch.meal}</span>, sort: (s) => s.batch.meal },
    { key: "qty", label: "Meals", align: "right", render: (s) => s.batch.qty, sort: (s) => s.batch.qty },
    { key: "status", label: "Status", render: (s) => <StatusBadge status={s.status} />, sort: (s) => STATUS_RANK[s.status.key] },
    { key: "where", label: "Location", render: (s) => s.place, sort: (s) => s.place },
    {
      key: "temp",
      label: "Temperature",
      align: "right",
      render: (s) => (s.deviceId ? <Reading value={s.temp} ts={s.tempTs} now={now} intervalS={s.intervalS} bad={s.temp !== null && outOfRange(s.temp)} /> : <span className="muted">–</span>),
      sort: (s) => s.temp,
    },
    {
      key: "flight",
      label: "Flight",
      render: (s) =>
        s.batch.flightNo ? (
          <span title={fmtDateTime(s.batch.flightDeparts)}>
            <Code>{s.batch.flightNo}</Code> <span className="muted small">{fmtTime(s.batch.flightDeparts)}</span>
          </span>
        ) : (
          <span className="tone-bad">missed</span>
        ),
      sort: (s) => s.batch.flightDeparts ?? 0,
    },
    {
      key: "expires",
      label: "Expires",
      align: "right",
      render: (s) => {
        const left = s.batch.expiresAt - now;
        return (
          <span className={left <= 0 ? "tone-bad" : left < 6 * 3600 ? "tone-warn" : ""} title={fmtDateTime(s.batch.expiresAt)}>
            {left > 0 ? `in ${fmtSpan(left)}` : "expired"}
          </span>
        );
      },
      sort: (s) => s.batch.expiresAt,
    },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Batches</h1>
          <p className="muted">Every meal batch on the ground, where it is and when it expires.</p>
        </div>
        <button className="btn btn-primary" onClick={() => exportRows(rows, "batches")} disabled={!rows.length}>
          <Download size={18} /> Export list
        </button>
      </div>

      <div className="toolbar">
        <input type="search" className="search" placeholder="Search batch, meal, flight or place…" value={p.q ?? ""} onChange={(e) => set({ q: e.target.value })} aria-label="Search batches" />
        <FilterSelect label="Status" value={p.status} onChange={(v) => set({ status: v })} options={["critical", "offline", "warning", "ok"].map((k) => [k, STATUS[k].label])} />
        <FilterSelect label="Where" value={p.stage} onChange={(v) => set({ stage: v })} options={[...STAGES.map((s) => [s.key, s.label]), ["departed", "Departed"]]} />
        <FilterSelect label="Flight" value={p.flight} onChange={(v) => set({ flight: v })} options={flights.map((f) => [f, f])} />
      </div>
      <div className="views" role="group" aria-label="Saved views">
        <span className="muted small">Saved views:</span>
        {VIEWS.map(([k, l]) => (
          <button key={k} className={`chip ${view === k ? "chip-active" : ""}`} onClick={() => set({ view: k === "all" ? null : k })} aria-pressed={view === k}>
            {l}
          </button>
        ))}
      </div>
      <FilterChips chips={chips} onClear={() => ctx.go("batches", null, view === "all" ? {} : { view }, { replace: true })} />

      <section className="card flush">
        <DataTable
          label="Batches"
          columns={columns}
          rows={rows}
          rowKey={(s) => s.batch.code}
          onOpen={(s) => set({ sel: s.batch.code })}
          activeKey={open}
          selectable
          selected={selected}
          onSelected={setSelected}
          defaultSort={{ key: "status", dir: "asc" }}
          rowClass={(s) => `row-${s.status.key}`}
          empty={view === "act" ? "No batches need action. That's good news." : "No batches match these filters."}
        />
      </section>

      {chosen.length > 0 && (
        <div className="bulkbar" role="region" aria-label="Selected batches">
          <strong>{chosen.length} selected</strong>
          <button className="btn btn-secondary" onClick={() => exportRows(chosen, "selected")}>
            <Download size={16} /> Export
          </button>
          <button className="btn btn-quiet" onClick={() => setSelected(new Set())}>
            <X size={16} /> Clear
          </button>
          <span className="muted small">Move and Hold need the backend and are not in this prototype.</span>
        </div>
      )}

      <SidePanel open={!!open} onClose={() => set({ sel: null })} width={720} title={open ? ctx.plan.byCode[open].meal : ""} subtitle={open} label="Batch details">
        {open && <BatchView code={open} ctx={ctx} inPanel />}
      </SidePanel>
    </div>
  );
}
