import { SlidersHorizontal } from "lucide-react";
import { LIMITS } from "../config.js";
import { deviceInfo } from "../data/registry.js";
import { batchesIn } from "../data/meals.js";
import { outOfRange, sensorLabel } from "../lib/alerts.js";
import { MSG_TIME_SOURCE, SIGNAL_HELP, STATUS, powerInfo } from "../lib/describe.js";
import { fmtAgo, fmtNum, plural } from "../lib/format.js";
import { setParams } from "../lib/router.js";
import { fleetStats } from "../lib/stats.js";
import { Battery, Reading, Signal, StatusBadge } from "../components/Badges.jsx";
import DataTable from "../components/DataTable.jsx";
import UnitDetail, { RANGES } from "../components/UnitDetail.jsx";
import CustomizeView from "../components/CustomizeView.jsx";
import { FilterChips, FilterSelect, Segmented, SidePanel, Skeleton } from "../components/UI.jsx";

const RANK = { critical: 0, offline: 1, warning: 2, ok: 3 };
const KINDS = [
  ["Cart", "Trolleys"],
  ["Truck", "Trucks"],
  ["Room", "Cold rooms"],
];

// Trolleys, trucks and cold rooms: what the temperature is and what is inside
export default function Storage({ ctx, devicesPage }) {
  const { route, now, view } = ctx;
  const p = route.params;
  if (!ctx.ready) return <Skeleton tiles={5} rows={6} />;
  const set = (patch) => setParams(route, patch);
  const range = Number(p.range) || RANGES[1].s;
  const rangeLabel = RANGES.find((r) => r.s === range)?.label ?? "";
  const q = (p.q ?? "").trim().toLowerCase();

  const rows = ctx.deviceList.filter((d) => {
    const info = deviceInfo(d.id);
    if (p.kind && info.kind !== p.kind) return false;
    if (p.status && ctx.unitStatus(d).key !== p.status) return false;
    if (q && ![info.name, info.kind, info.assignment, d.id, ...Object.keys(d.sensors)].some((x) => x.toLowerCase().includes(q))) return false;
    return true;
  });
  const unit = p.unit && ctx.devices[p.unit] ? ctx.devices[p.unit] : null;
  const fleet = fleetStats(ctx.deviceList, now - range, now);
  const online = ctx.deviceList.filter((d) => ctx.unitStatus(d).key !== "offline").length;
  const missing = ctx.deviceList.reduce((n, d) => n + d.missing.size, 0);

  const col = view.columns;
  const columns = devicesPage ? deviceColumns(ctx) : storageColumns(ctx, col);
  const chips = [
    p.q && { key: "q", label: `“${p.q}”`, remove: () => set({ q: null }) },
    p.kind && { key: "kind", label: `Type: ${KINDS.find(([k]) => k === p.kind)?.[1]}`, remove: () => set({ kind: null }) },
    p.status && { key: "status", label: `Status: ${STATUS[p.status].label}`, remove: () => set({ status: null }) },
  ].filter(Boolean);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{devicesPage ? "Devices" : "Storage"}</h1>
          <p className="muted">
            {devicesPage
              ? "The sensor box on each trolley, truck and room: signal, power, memory card and data quality."
              : `Trolleys, trucks and cold rooms. Safe range ${LIMITS.tempMinC}–${LIMITS.tempMaxC} °C.`}
          </p>
        </div>
        <button className="btn btn-secondary" onClick={() => set({ customize: "1" })}>
          <SlidersHorizontal size={18} /> Customize view
        </button>
      </div>

      {!devicesPage && (
        <section className="stats-row" aria-label="Summary">
          <div className="stat">
            <span className="stat-label">Units reporting</span>
            <span className={`stat-value ${online < ctx.deviceList.length ? "tone-bad" : ""}`}>
              {online} of {ctx.deviceList.length}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Time in range ({rangeLabel})</span>
            <span className={`stat-value ${fleet.inRangePct !== null && fleet.inRangePct < 99 ? "tone-bad" : ""}`}>{fleet.inRangePct === null ? "–" : `${fleet.inRangePct.toFixed(1)}%`}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Average temperature now</span>
            <span className="stat-value">{fmtNum(fleet.avgNow, 1, " °C")}</span>
            <span className="muted small">
              {fmtNum(fleet.minNow, 1)} to {fmtNum(fleet.maxNow, 1, " °C")}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Door openings ({rangeLabel})</span>
            <span className="stat-value">{fleet.doorOpenings}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Lowest battery</span>
            <span className={`stat-value ${fleet.lowestBattery?.pct < 20 ? "tone-bad" : ""}`}>{fleet.lowestBattery ? `${fleet.lowestBattery.pct}%` : "–"}</span>
            <span className="muted small">{fleet.lowestBattery ? deviceInfo(fleet.lowestBattery.d.id).name : "all plugged in"}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Messages received</span>
            <span className="stat-value">{ctx.stats.received.toLocaleString()}</span>
            <span className="muted small">
              {missing} missing · {ctx.stats.duplicates} duplicate
            </span>
          </div>
          <Segmented label="Statistics period" options={RANGES.map((r) => [r.s, r.label])} value={range} onChange={(v) => set({ range: v })} />
        </section>
      )}

      <div className="toolbar">
        <input type="search" className="search" placeholder="Search unit, device or sensor…" value={p.q ?? ""} onChange={(e) => set({ q: e.target.value })} aria-label="Search units" />
        <FilterSelect label="Type" value={p.kind} onChange={(v) => set({ kind: v })} options={KINDS.filter(([k]) => view.kinds[k])} />
        <FilterSelect label="Status" value={p.status} onChange={(v) => set({ status: v })} options={["critical", "offline", "warning", "ok"].map((k) => [k, STATUS[k].label])} />
      </div>
      <FilterChips chips={chips} onClear={() => ctx.go(route.page, null, {}, { replace: true })} />

      <section className="card flush">
        <DataTable
          label={devicesPage ? "Devices" : "Storage units"}
          columns={columns}
          rows={rows}
          rowKey={(d) => d.id}
          onOpen={(d) => set({ unit: d.id })}
          activeKey={unit?.id}
          defaultSort={{ key: "status", dir: "asc" }}
          rowClass={(d) => `row-${ctx.unitStatus(d).key}`}
          empty={ctx.deviceList.length ? "No units match these filters." : "All unit types are hidden. Turn them on in Customize view."}
        />
      </section>
      {!devicesPage && (
        <p className="muted small legend">
          {Object.values(STATUS).map((s) => (
            <span key={s.key}>
              <StatusBadge status={s} /> {s.hint}
            </span>
          ))}
        </p>
      )}

      <SidePanel
        open={!!unit}
        onClose={() => set({ unit: null })}
        width={720}
        label="Unit details"
        title={
          unit && (
            <div className="alert-title">
              <h2>{deviceInfo(unit.id).name}</h2>
              <StatusBadge status={ctx.unitStatus(unit)} />
            </div>
          )
        }
        subtitle={unit && `${deviceInfo(unit.id).kind === "Cart" ? "Trolley" : deviceInfo(unit.id).kind} · ${deviceInfo(unit.id).assignment}`}
      >
        {unit && (
          <UnitDetail
            key={devicesPage ? "dev" : "sto"}
            device={unit}
            devices={ctx.deviceList}
            onSelect={(id) => set({ unit: id })}
            alerts={ctx.alerts.filter((a) => a.deviceId === unit.id)}
            now={now}
            range={range}
            onRange={(v) => set({ range: v })}
            categories={view.categories}
            initialTab={devicesPage ? "connectivity" : "all"}
            ctx={ctx}
          />
        )}
      </SidePanel>

      <SidePanel open={p.customize === "1"} onClose={() => set({ customize: null })} width={480} title="Customize view" subtitle="Choose which values you see. Saved in this browser.">
        <CustomizeView view={view} onChange={ctx.setView} groups={devicesPage ? ["categories", "kinds"] : ["columns", "categories", "kinds"]} />
      </SidePanel>
    </div>
  );
}

function storageColumns(ctx, col) {
  const { now } = ctx;
  const temps = (d) => Object.entries(d.sensors).filter(([, s]) => Number.isFinite(s.temp_c));
  return [
    col.status && { key: "status", label: "Status", render: (d) => <StatusBadge status={ctx.unitStatus(d)} />, sort: (d) => RANK[ctx.unitStatus(d).key] },
    {
      key: "unit",
      label: "Unit",
      render: (d) => (
        <>
          <div className="strong">{deviceInfo(d.id).name}</div>
          <div className="muted small">{deviceInfo(d.id).assignment}</div>
        </>
      ),
      sort: (d) => deviceInfo(d.id).name,
    },
    col.carrying && {
      key: "carrying",
      label: "Meals inside",
      align: "right",
      render: (d) => {
        const inside = batchesIn(ctx.picture.list, d.id);
        return inside.length ? (
          <>
            {inside.reduce((a, s) => a + s.batch.qty, 0)}
            <div className="muted small">{plural(inside.length, "batch", "batches")}</div>
          </>
        ) : (
          <span className="muted">Empty</span>
        );
      },
      sort: (d) => batchesIn(ctx.picture.list, d.id).reduce((a, s) => a + s.batch.qty, 0),
    },
    col.temperature && {
      key: "temp",
      label: "Temperature",
      align: "right",
      render: (d) =>
        temps(d).map(([id, s]) => (
          <div key={id}>
            <Reading value={s.temp_c} ts={d.lastTs} now={now} intervalS={d.intervalS} bad={outOfRange(s.temp_c)} />
            {temps(d).length > 1 && <span className="muted small"> {sensorLabel(d, id)}</span>}
          </div>
        )),
      sort: (d) => Math.max(...temps(d).map(([, s]) => s.temp_c), -99),
    },
    col.humidity && {
      key: "rh",
      label: "Humidity",
      align: "right",
      tip: "Relative humidity: how much water the air holds compared with the most it could hold at that temperature.",
      render: (d) => temps(d).map(([id, s]) => <div key={id}>{fmtNum(s.rh, 0, " %")}</div>),
      sort: (d) => temps(d)[0]?.[1].rh,
    },
    col.door && {
      key: "door",
      label: "Door",
      render: (d) => (d.door ? d.door.state === "open" ? <span className="pill pill-open">Open</span> : <span className="muted">Closed</span> : <span className="muted small">No door sensor</span>),
      sort: (d) => d.door?.state ?? "z",
    },
    col.lastMessage && {
      key: "last",
      label: "Last message",
      render: (d) => (
        <>
          {fmtAgo(d.lastTs, now)}
          {d.tsSource && <div className="muted small">{MSG_TIME_SOURCE[d.tsSource] ?? d.tsSource}</div>}
        </>
      ),
      sort: (d) => -(d.lastTs ?? 0),
    },
    col.signal && { key: "signal", label: "Signal", tip: SIGNAL_HELP, render: (d) => (d.network ? <Signal rssi={d.network.rssi} type={d.network.type} /> : "–"), sort: (d) => d.network?.rssi },
    col.power && { key: "power", label: "Power & battery", render: (d) => <Battery info={powerInfo(d.power)} />, sort: (d) => (d.power?.source === "battery" ? d.power.battery_pct : 200) },
    col.location && { key: "loc", label: "Location", render: (d) => <span className="small">{d.gps ? `${d.gps.lat.toFixed(4)}, ${d.gps.lon.toFixed(4)}` : "–"}</span> },
  ].filter(Boolean);
}

function deviceColumns(ctx) {
  const { now } = ctx;
  return [
    { key: "status", label: "Status", render: (d) => <StatusBadge status={ctx.unitStatus(d)} />, sort: (d) => RANK[ctx.unitStatus(d).key] },
    { key: "unit", label: "Unit", render: (d) => <span className="strong">{deviceInfo(d.id).name}</span>, sort: (d) => deviceInfo(d.id).name },
    { key: "id", label: "Device ID", render: (d) => <span className="code">{d.id}</span>, sort: (d) => d.id },
    { key: "last", label: "Last message", render: (d) => <span className={`ago-${d.lastTs && now - d.lastTs > d.intervalS * 1.5 + 5 ? "late" : "fresh"}`}>{fmtAgo(d.lastTs, now)}</span>, sort: (d) => -(d.lastTs ?? 0) },
    { key: "signal", label: "Signal", tip: SIGNAL_HELP, render: (d) => (d.network ? <Signal rssi={d.network.rssi} type={d.network.type} /> : "–"), sort: (d) => d.network?.rssi },
    { key: "power", label: "Power & battery", render: (d) => <Battery info={powerInfo(d.power)} />, sort: (d) => (d.power?.source === "battery" ? d.power.battery_pct : 200) },
    { key: "sd", label: "Memory card", render: (d) => (d.storage ? d.storage.sd_present ? `${Math.round((d.storage.sd_free_mb / d.storage.sd_total_mb) * 100)}% free` : <span className="tone-bad">Missing</span> : "–") },
    { key: "fw", label: "Firmware", render: (d) => d.system?.fw ?? "–", sort: (d) => d.system?.fw },
    { key: "missing", label: "Missing messages", align: "right", render: (d) => d.missing.size, sort: (d) => d.missing.size },
  ];
}
