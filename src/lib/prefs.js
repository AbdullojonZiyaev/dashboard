// Per-browser preferences (theme, density, handled alerts, recent batches, tour).
// Wrapped in try/catch: storage can be unavailable (private windows) and the
// dashboard must work without it.

import { useState } from "react";

const PREFIX = "cold-chain-dashboard:";

export function readPref(key, fallback) {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

export function writePref(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // not saved: lasts for this visit only
  }
}

export function usePref(key, fallback) {
  const [value, setValue] = useState(() => readPref(key, fallback));
  const set = (v) =>
    setValue((old) => {
      const next = typeof v === "function" ? v(old) : v;
      writePref(key, next);
      return next;
    });
  return [value, set];
}
