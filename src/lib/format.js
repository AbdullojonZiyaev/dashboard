const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const timeSecFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export const fmtTime = (ts) => (ts ? timeFmt.format(new Date(ts * 1000)) : "–");
export const fmtTimeSec = (ts) => (ts ? timeSecFmt.format(new Date(ts * 1000)) : "–");

export function fmtAgo(ts, now) {
  if (!ts) return "never";
  const s = Math.max(0, Math.round(now - ts));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min ago`;
}

export function fmtDuration(s) {
  s = Math.max(0, Math.round(s));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${s % 60} s`;
  return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
}

export const fmtNum = (v, digits = 1, unit = "") => (Number.isFinite(v) ? `${v.toFixed(digits)}${unit}` : "–");
