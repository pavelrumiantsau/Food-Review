import { type DependencyList, useCallback, useEffect, useRef, useState } from "react";

// Last response per cache key, so screens re-render at full height immediately when
// returning to them (keeps scroll restoration working) while fresh data loads.
const cache = new Map<string, unknown>();

/**
 * Loads data on mount / when deps change; ignores stale responses.
 * With `cacheKey`, the last result is shown instantly and refreshed in the background.
 */
export function useLoad<T>(load: () => Promise<T>, deps: DependencyList, cacheKey?: string) {
  const [data, setData] = useState<T | undefined>(() => (cacheKey ? (cache.get(cacheKey) as T | undefined) : undefined));
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  const reload = useCallback(() => {
    const id = ++seq.current;
    setLoading(true);
    if (cacheKey && cache.has(cacheKey)) setData(cache.get(cacheKey) as T);
    load()
      .then((d) => {
        if (id !== seq.current) return;
        if (cacheKey) cache.set(cacheKey, d);
        setData(d);
        setError(undefined);
      })
      .catch((e: Error) => id === seq.current && setError(e.message))
      .finally(() => id === seq.current && setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(reload, [reload]);
  return { data, setData, error, loading, reload };
}

export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export const today = () => new Date().toLocaleDateString("sv"); // YYYY-MM-DD in local time
