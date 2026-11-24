// Times and numbers as people say them (DESIGN.md §9): relative for recent things,
// "24 Nov, 14:05" otherwise, one decimal for temperatures, durations in words.

const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const timeSecFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

export const fmtTime = (ts) => (ts ? timeFmt.format(new Date(ts * 1000)) : "–");
export const fmtTimeSec = (ts) => (ts ? timeSecFmt.format(new Date(ts * 1000)) : "–");
export const fmtDateTime = (ts) => (ts ? `${dayFmt.format(new Date(ts * 1000))}, ${fmtTime(ts)}` : "–");

// Durations in words: "45 s", "12 min", "3 h 10 min", "2 days 4 h"
export function fmtSpan(s) {
  s = Math.max(0, Math.round(s));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 48 * 3600) {
    const m = Math.floor((s % 3600) / 60);
    return `${Math.floor(s / 3600)} h${m ? ` ${m} min` : ""}`;
  }
  return `${Math.floor(s / 86400)} days ${Math.floor((s % 86400) / 3600)} h`;
}

export function fmtAgo(ts, now) {
  if (!ts) return "never";
  const s = now - ts;
  if (s < 10) return "just now";
  return `${fmtSpan(s)} ago`;
}

// "in 1 h 10 min" or "20 min ago"
export function fmtUntil(ts, now) {
  return ts >= now ? `in ${fmtSpan(ts - now)}` : `${fmtSpan(now - ts)} ago`;
}

// Kept for the detail tables: precise to the second
export function fmtDuration(s) {
  s = Math.max(0, Math.round(s));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${s % 60} s`;
  return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
}

export const fmtNum = (v, digits = 1, unit = "") => (Number.isFinite(v) ? `${v.toFixed(digits)}${unit}` : "–");
export const fmtTemp = (v) => fmtNum(v, 1, " °C");
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
