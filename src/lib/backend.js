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
