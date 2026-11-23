// Plain-language descriptions of status, signal strength and power, shared by the
// table, the detail view, the exports and the assistant.

import { isOffline, worstSeverity } from "./alerts.js";

export const STATUS = {
  ok: { key: "ok", label: "Normal", icon: "✓", hint: "All readings within limits and the device is reporting." },
  warning: { key: "warning", label: "Warning", icon: "!", hint: "Something needs checking soon (door, battery, sensor, restart)." },
  critical: { key: "critical", label: "Critical", icon: "✕", hint: "Food-safety risk: temperature out of limits. Act now." },
  offline: { key: "offline", label: "Offline", icon: "–", hint: "No data received for 3 reporting intervals." },
};

export function unitStatus(d, alerts, now) {
  if (isOffline(d, now)) return STATUS.offline;
  return STATUS[worstSeverity(alerts.filter((a) => a.deviceId === d.id))];
}

export const SEVERITY = {
  critical: { label: "Critical", icon: "✕", meaning: "Act now: food-safety risk" },
  warning: { label: "Warning", icon: "!", meaning: "Check soon: may become a problem" },
  info: { label: "Info", icon: "i", meaning: "For awareness: no action needed" },
};

// dBm = decibel-milliwatts, the received radio signal power. It is always negative;
// the closer to 0, the stronger the signal.
export const SIGNAL_HELP =
  "Signal strength in dBm (decibel-milliwatts). It is always negative: the closer to 0, the stronger. " +
  "About −50 is excellent, −67 good, −75 fair, −80 weak and −90 or lower very weak (data may be delayed or buffered).";

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
