// Plain-language status, signal and power descriptions, shared by every screen, the
// exports and the assistant. One status always has the same word, icon and color
// (DESIGN.md §3.1): OK · Check soon · Act now · No signal.

import { isOffline, worstSeverity } from "./alerts.js";

export const STATUS = {
  ok: { key: "ok", label: "OK", hint: "Within limits." },
  warning: { key: "warning", label: "Check soon", hint: "Approaching a limit or close to expiry. Have a look soon." },
  critical: { key: "critical", label: "Act now", hint: "A limit was crossed. Action needed." },
  offline: { key: "offline", label: "No signal", hint: "No data received for 3 reporting intervals, or not scanned." },
};

// Alert levels use the same words as the status they cause
export const SEVERITY = {
  critical: { key: "critical", label: "Act now", meaning: "A limit was crossed. Action needed." },
  warning: { key: "warning", label: "Check soon", meaning: "May become a problem. Have a look soon." },
  info: { key: "info", label: "Info", meaning: "For awareness. No action needed." },
};

export function unitStatus(d, alerts, now) {
  if (isOffline(d, now)) return STATUS.offline;
  return STATUS[worstSeverity(alerts.filter((a) => a.deviceId === d.id))];
}

// dBm = decibel-milliwatts, the received radio signal power. It is always negative;
// the closer to 0, the stronger the signal.
export const SIGNAL_HELP =
  "Signal strength in dBm (decibel-milliwatts). It is always negative: the closer to 0, the stronger. " +
  "About −50 is excellent, −67 good, −75 fair, −80 weak and −90 or lower very weak (data may arrive late).";

export function signalInfo(rssi) {
  if (!Number.isFinite(rssi)) return { label: "Unknown", bars: 0, tone: "muted" };
  if (rssi >= -60) return { label: "Excellent", bars: 4, tone: "good" };
  if (rssi >= -70) return { label: "Good", bars: 3, tone: "good" };
  if (rssi >= -80) return { label: "Fair", bars: 2, tone: "warn" };
  if (rssi >= -90) return { label: "Weak", bars: 1, tone: "bad" };
  return { label: "Very weak", bars: 1, tone: "bad" };
}

export function powerInfo(power, lowPct = 20) {
  if (!power) return { label: "Not reported yet", pct: null, tone: "muted", source: null };
  const pct = power.battery_pct;
  const onBattery = power.source === "battery";
  const tone = !onBattery ? "good" : pct < lowPct ? "bad" : pct < 40 ? "warn" : "good";
  return {
    source: onBattery ? "Battery" : "Mains",
    label: onBattery ? `Running on battery · ${pct}% left` : `Plugged in · backup battery ${pct}%`,
    short: onBattery ? "On battery" : "Plugged in",
    pct,
    tone,
  };
}

export const MSG_TIME_SOURCE = { gps: "GPS time", ntp: "Internet time (NTP)", rtc: "Internal clock (less accurate)" };

export const RESET_TEXT = {
  power_on: "Normal power-on",
  brownout: "Power dip (brownout)",
  watchdog: "Software froze and restarted (watchdog)",
  panic: "Software crash",
  sw_reset: "Restarted by software",
};
export const resetText = (r) => RESET_TEXT[r] ?? r ?? "–";

// "Live reading" freshness: fresh, late (missed a report) or gone (offline)
export function freshness(ts, intervalS, now) {
  if (!ts) return "gone";
  const age = now - ts;
  if (age > intervalS * 3) return "gone";
  if (age > intervalS * 1.5 + 5) return "late";
  return "fresh";
}
