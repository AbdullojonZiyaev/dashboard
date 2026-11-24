import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { InfoTip } from "./Badges.jsx";

// The one table pattern used on every list (DESIGN.md §6):
// sticky header, sort on header click with a clear arrow, numbers right-aligned,
// hover highlight, optional row selection, J/K to move between rows.
//
// columns: [{ key, label, render(row), sort?(row) -> value, align?: "right", tip?, width? }]
export default function DataTable({ columns, rows, rowKey, onOpen, activeKey, selectable, selected, onSelected, rowClass, empty, defaultSort, keyboard = true, label }) {
  const [sort, setSort] = useState(defaultSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return rows.slice().sort((a, b) => {
      const x = col.sort(a);
      const y = col.sort(b);
      if (x === y) return 0;
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return (x > y ? 1 : -1) * dir;
    });
  }, [rows, sort, columns]);

  // J / K: next / previous row (opens it), like the rest of the keyboard shortcuts
  useEffect(() => {
    if (!keyboard || !onOpen) return;
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) return;
      if (e.key !== "j" && e.key !== "k") return;
      const i = sorted.findIndex((r) => rowKey(r) === activeKey);
      const next = e.key === "j" ? Math.min(sorted.length - 1, i + 1) : Math.max(0, i - 1);
      if (sorted[next]) {
        e.preventDefault();
        onOpen(sorted[next]);
        document.querySelector(`[data-row="${CSS.escape(String(rowKey(sorted[next])))}"]`)?.scrollIntoView({ block: "nearest" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keyboard, onOpen, sorted, activeKey, rowKey]);

  const toggleSort = (c) => {
    if (!c.sort) return;
    setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === "asc" ? "desc" : "asc" } : { key: c.key, dir: "asc" }));
  };
  const allOn = selectable && rows.length > 0 && rows.every((r) => selected.has(rowKey(r)));
  const toggleRow = (k) => {
    const next = new Set(selected);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    onSelected(next);
  };

  return (
    <div className="table-wrap">
      <table className="dtable" aria-label={label}>
        <thead>
          <tr>
            {selectable && (
              <th className="col-check">
                <input type="checkbox" checked={allOn} onChange={() => onSelected(allOn ? new Set() : new Set(rows.map(rowKey)))} aria-label="Select all rows" />
              </th>
            )}
            {columns.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  className={`${c.align === "right" ? "num" : ""} ${c.sort ? "sortable" : ""}`}
                  style={c.width ? { width: c.width } : undefined}
                  aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                >
                  {c.sort ? (
                    <button className="th-btn" onClick={() => toggleSort(c)}>
                      {c.label}
                      {active ? sort.dir === "asc" ? <ArrowUp size={14} /> : <ArrowDown size={14} /> : <span className="sort-hint" />}
                    </button>
                  ) : (
                    c.label
                  )}
                  {c.tip && <InfoTip text={c.tip} />}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const k = rowKey(r);
            return (
              <tr
                key={k}
                data-row={k}
                className={`${onOpen ? "clickable" : ""} ${k === activeKey ? "active" : ""} ${selectable && selected.has(k) ? "selected" : ""} ${rowClass?.(r) ?? ""}`}
                onClick={onOpen ? () => onOpen(r) : undefined}
                tabIndex={onOpen ? 0 : undefined}
                onKeyDown={onOpen ? (e) => e.key === "Enter" && e.target === e.currentTarget && onOpen(r) : undefined}
              >
                {selectable && (
                  <td className="col-check" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(k)} onChange={() => toggleRow(k)} aria-label="Select row" />
                  </td>
                )}
                {columns.map((c) => (
                  <td key={c.key} className={c.align === "right" ? "num" : ""}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            );
          })}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={columns.length + (selectable ? 1 : 0)} className="empty-cell">
                {empty ?? "Nothing to show."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
