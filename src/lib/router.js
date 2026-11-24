// Tiny hash router: #/page/arg?filter=value
// Filters live in the URL, so the browser's Back button returns to the same list
// with the same filters (DESIGN.md §7 "Back works").

import { useEffect, useState } from "react";

export function parseHash(hash = typeof location === "undefined" ? "" : location.hash) {
  const raw = hash.replace(/^#\/?/, "");
  const [path, qs = ""] = raw.split("?");
  const [page, ...rest] = path.split("/").filter(Boolean);
  return { page: page || "home", arg: rest.length ? decodeURIComponent(rest.join("/")) : null, params: Object.fromEntries(new URLSearchParams(qs)) };
}

export function buildHash(page, arg = null, params = {}) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""));
  const qs = new URLSearchParams(clean).toString();
  return `#/${page}${arg ? `/${encodeURIComponent(arg)}` : ""}${qs ? `?${qs}` : ""}`;
}

export function navigate(page, arg = null, params = {}, { replace = false } = {}) {
  const hash = buildHash(page, arg, params);
  if (hash === location.hash) return;
  if (replace) {
    history.replaceState(null, "", hash);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    location.hash = hash;
  }
}

export function useRoute() {
  const [route, setRoute] = useState(() => parseHash());
  useEffect(() => {
    const on = () => setRoute(parseHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

// Change some filters of the current page without adding a history entry
export function setParams(route, patch) {
  navigate(route.page, route.arg, { ...route.params, ...patch }, { replace: true });
}
