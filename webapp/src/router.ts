// Tiny history-based router. The Worker serves index.html for unknown paths, so deep links work.
import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
window.addEventListener("popstate", notify);

/** Depth of in-app history, so Back can fall back to Home when the app was opened on a deep link. */
const depth = () => (history.state?.depth as number | undefined) ?? 0;

export function navigate(to: string, { replace = false } = {}) {
  if (replace) history.replaceState({ depth: depth() }, "", to);
  else history.pushState({ depth: depth() + 1 }, "", to);
  notify();
}

export function goBack() {
  if (depth() > 0) history.back();
  else navigate("/", { replace: true });
}

export function useLocation(): { path: string; params: URLSearchParams } {
  const href = useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    () => location.pathname + location.search,
  );
  const url = new URL(href, location.origin);
  return { path: url.pathname, params: url.searchParams };
}

/** match("/place/:id", "/place/12") → { id: "12" }; null if no match. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split("/");
  const s = path.replace(/\/$/, "").split("/");
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(":")) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return params;
}
