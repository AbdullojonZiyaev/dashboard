import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { RANGES } from "../components/UnitDetail.jsx";
import { Segmented } from "../components/UI.jsx";
import { setParams } from "../lib/router.js";

export default function Reports({ ctx }) {
  const { route, busy } = ctx;
  const range = Number(route.params.range) || RANGES[1].s;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Reports</h1>
          <p className="muted">Download what the dashboard shows, for audits and handovers.</p>
        </div>
      </div>
      <div className="toolbar">
        <span className="muted">Statistics period</span>
        <Segmented label="Statistics period" options={RANGES.map((r) => [r.s, r.label])} value={range} onChange={(v) => setParams(route, { range: v })} />
      </div>
      <div className="two-col">
        <section className="card report-card">
          <FileText size={28} aria-hidden="true" />
          <h2>Food safety report (PDF)</h2>
          <p>A printable summary for the shift: overall status, every unit, open alerts, a temperature chart per unit, door openings, flights and device health.</p>
          <button className="btn btn-primary" onClick={() => ctx.download("report", range)} disabled={!!busy || !ctx.ready}>
            <Download size={18} /> {busy === "report" ? "Preparing…" : "Download report (PDF)"}
          </button>
        </section>
        <section className="card report-card">
          <FileSpreadsheet size={28} aria-hidden="true" />
          <h2>All data (Excel)</h2>
          <p>Every reading the dashboard holds, with sheets for the summary, units, alerts, batches, flights, readings, door events and device health. Filter and sort it in Excel.</p>
          <button className="btn btn-secondary" onClick={() => ctx.download("excel", range)} disabled={!!busy || !ctx.ready}>
            <Download size={18} /> {busy === "excel" ? "Preparing…" : "Export Excel"}
          </button>
        </section>
      </div>
      {ctx.error && (
        <p className="error" role="alert">
          {ctx.error}
        </p>
      )}
    </div>
  );
}
