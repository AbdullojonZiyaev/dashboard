// Reads what the backend API (system/backend) has stored.
// In development Vite forwards /backend/* to the API (see vite.config.js), so no CORS
// setup is needed. Set VITE_BACKEND_URL to call the API somewhere else.

import { useEffect, useState } from "react";

export const BACKEND = import.meta.env.VITE_BACKEND_URL || "/backend";
const POLL_MS = 10_000;

async function getJson(path, signal) {
  const res = await fetch(`${BACKEND}${path}`, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText || "error"}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("unexpected answer");
  return data;
}

// Latest readings and devices, refreshed every 10 s while `enabled`.
// status: "checking" | "live" | "offline"
export function useBackendReadings(enabled, limit = 300) {
  const [state, setState] = useState({ status: "checking", readings: [], devices: [], error: null, checkedAt: null });
  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    let ctl;
    const load = async () => {
      ctl = new AbortController();
      const timeout = setTimeout(() => ctl.abort(), 5000);
      try {
        const [readings, devices] = await Promise.all([getJson(`/api/readings?limit=${limit}`, ctl.signal), getJson("/api/devices", ctl.signal)]);
        if (!stop) setState({ status: "live", readings, devices, error: null, checkedAt: Date.now() });
      } catch (e) {
        if (!stop) setState((s) => ({ ...s, status: "offline", error: e.name === "AbortError" ? "no answer within 5 s" : e.message, checkedAt: Date.now() }));
      } finally {
        clearTimeout(timeout);
      }
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      stop = true;
      clearInterval(t);
      ctl?.abort();
    };
  }, [enabled, limit]);
  return state;
}

// Readings of every device over the last `windowS` seconds, grouped per device and
// shaped like the dashboard's own devices ({ id, history: [{ ts, "t:<sensor>": temp }] }),
// so the control chart can use them. The current format has one sensor per device ("main").
// status: "checking" | "live" | "offline"
export const BACKEND_SENSOR = "main";
const HISTORY_LIMIT = 5000;
export function useBackendHistory(enabled, windowS) {
  const [state, setState] = useState({ status: "checking", devices: [], truncated: false, error: null });
  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    let ctl;
    const load = async () => {
      ctl = new AbortController();
      const timeout = setTimeout(() => ctl.abort(), 8000);
      try {
        const since = new Date(Date.now() - windowS * 1000).toISOString();
        const rows = await getJson(`/api/readings?since=${encodeURIComponent(since)}&limit=${HISTORY_LIMIT}`, ctl.signal);
        const byDevice = new Map();
        for (const r of rows) {
          const ts = Date.parse(r.received_at) / 1000;
          if (!Number.isFinite(ts) || !Number.isFinite(r.temperature)) continue;
          if (!byDevice.has(r.device)) byDevice.set(r.device, []);
          byDevice.get(r.device).push({ ts, [`t:${BACKEND_SENSOR}`]: r.temperature, [`rh:${BACKEND_SENSOR}`]: r.humidity });
        }
        const devices = [...byDevice.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, history]) => ({ id, history: history.sort((a, b) => a.ts - b.ts) }));
        if (!stop) setState({ status: "live", devices, truncated: rows.length >= HISTORY_LIMIT, error: null });
      } catch (e) {
        if (!stop) setState((s) => ({ ...s, status: "offline", error: e.name === "AbortError" ? "no answer within 8 s" : e.message }));
      } finally {
        clearTimeout(timeout);
      }
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      stop = true;
      clearInterval(t);
      ctl?.abort();
    };
  }, [enabled, windowS]);
  return state;
}
