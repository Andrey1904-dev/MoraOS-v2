import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Tiny data-fetching hook used by every page.
 *
 * Gives the UI a real loading → loaded lifecycle so skeleton states are
 * exercised today and the transition to Supabase needs no rework.
 */
export function useResource<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const mounted = useRef(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    setError(null);
    fetcherRef
      .current()
      .then((res) => {
        if (mounted.current) setData(res);
      })
      .catch((err: unknown) => {
        if (mounted.current) setError(err instanceof Error ? err : new Error("Неизвестная ошибка"));
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });
    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const refetch = useCallback(() => {
    setLoading(true);
    fetcherRef
      .current()
      .then((res) => setData(res))
      .finally(() => setLoading(false));
  }, []);

  return { data, loading, error, refetch };
}

/** Local UI state helper for lists that need filtering/sorting in memory. */
export function useLocalState<T>(initial: T) {
  const [value, setValue] = useState<T>(initial);
  return [value, setValue] as const;
}
