import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { getStatuses } from "../api/client.js";
import type { StatusDef } from "../api/client.js";

export type StatusCatalogValue = {
  statuses: StatusDef[];
  loading: boolean;
  refetch: () => Promise<void>;
};

/**
 * Safe no-op default, used when `useStatusCatalog()` is called outside a `StatusCatalogProvider`
 * (e.g. an existing component test rendering a `StatusBadge`/etc. consumer without wrapping it).
 * Consumers see an empty catalog and fall back to their "not found" treatment rather than crashing.
 */
const defaultValue: StatusCatalogValue = {
  statuses: [],
  loading: false,
  refetch: async () => {},
};

const StatusCatalogContext = createContext<StatusCatalogValue>(defaultValue);

export function StatusCatalogProvider({ children }: { children: ReactNode }) {
  const [statuses, setStatuses] = useState<StatusDef[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    const fetched = await getStatuses();
    setStatuses(fetched);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getStatuses()
      .then((fetched) => {
        if (!cancelled) setStatuses(fetched);
      })
      .catch(() => {
        // Mirrors App.tsx's own mount-fetch convention (getConfig/getStats/etc. are all
        // wrapped in `.catch(() => {})`) — a failed catalog fetch shouldn't crash the app,
        // it just leaves `statuses` empty and consumers fall back to their "not found" treatment.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <StatusCatalogContext.Provider value={{ statuses, loading, refetch }}>{children}</StatusCatalogContext.Provider>
  );
}

export function useStatusCatalog(): StatusCatalogValue {
  return useContext(StatusCatalogContext);
}
