import { useCallback, useEffect, useRef, useState } from "react";
import type { Project } from "../types.js";
import { getProjects, type ProjectFilters } from "../api/client.js";
import { PAGE_SIZE } from "../constants.js";

const DEFAULT_PAGE_SIZE = PAGE_SIZE;

export function useProjects(initialFilters: Partial<Omit<ProjectFilters, "page" | "pageSize">> = {}) {
  const [projects, setProjects] = useState<(Project & { audioFileCount: number })[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFiltersState] = useState<ProjectFilters>({
    ...initialFilters,
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  // Monotonic request counter: guards against a stale response (from a request superseded
  // by a newer one before it resolved) overwriting state with out-of-date results.
  const latestRequestId = useRef(0);

  const refetch = useCallback(() => {
    const requestId = ++latestRequestId.current;
    setLoading(true);
    setError(undefined);
    getProjects(filters)
      .then((result) => {
        if (latestRequestId.current !== requestId) return; // superseded by a newer request
        setProjects(result.projects);
        setTotal(result.total);
        setTotalPages(result.totalPages);
      })
      .catch((err) => {
        if (latestRequestId.current !== requestId) return;
        setError(err.message);
      })
      .finally(() => {
        if (latestRequestId.current !== requestId) return;
        setLoading(false);
      });
  }, [filters]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // If a scan or search shrinks the result set, clamp back onto the last page that still has data.
  useEffect(() => {
    setFiltersState((prev) => {
      const currentPage = prev.page ?? 1;
      return currentPage > totalPages ? { ...prev, page: totalPages } : prev;
    });
  }, [totalPages]);

  /** Updates the search filter and resets to page 1, since the previous page may no longer exist. */
  const updateFilters = useCallback((patch: Omit<ProjectFilters, "page" | "pageSize">) => {
    setFiltersState((prev) => ({ ...prev, ...patch, page: 1 }));
  }, []);

  const setPage = useCallback((page: number) => {
    setFiltersState((prev) => ({ ...prev, page }));
  }, []);

  return {
    projects,
    total,
    totalPages,
    page: filters.page ?? 1,
    pageSize: filters.pageSize ?? DEFAULT_PAGE_SIZE,
    filters,
    updateFilters,
    setPage,
    loading,
    error,
    refetch,
  };
}
