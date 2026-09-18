import { useCallback, useEffect, useRef, useState } from "react";
import type { Project } from "../types.js";
import { getProjects, type ProjectFilters } from "../api/client.js";
import { PAGE_SIZE } from "../constants.js";
import { useItemsPerPage } from "./useItemsPerPage.js";

const DEFAULT_PAGE_SIZE = PAGE_SIZE;

export function useProjects(initialFilters: Partial<Omit<ProjectFilters, "page" | "pageSize">> = {}) {
  const itemsPerPage = useItemsPerPage();
  const [projects, setProjects] = useState<(Project & { audioFileCount: number })[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFiltersState] = useState<ProjectFilters>({
    ...initialFilters,
    page: 1,
    pageSize: itemsPerPage,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  // Monotonic request counter: guards against a stale response (from a request superseded
  // by a newer one before it resolved) overwriting state with out-of-date results.
  const latestRequestId = useRef(0);
  // Mount flag: guards against a setState call after the component has genuinely unmounted,
  // as opposed to latestRequestId above which guards against a request merely being superseded.
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Skips the very first render's value (already seeded into the initial filters state
  // above) and only reacts to a genuine *change* -- e.g. the Settings panel's Apply button
  // being clicked while this hook instance is already mounted. Goes through setFiltersState
  // directly rather than `updateFilters` (whose patch type intentionally excludes `pageSize`)
  // to avoid widening that helper's public type just for this one internal case.
  const isFirstItemsPerPageRender = useRef(true);
  useEffect(() => {
    if (isFirstItemsPerPageRender.current) {
      isFirstItemsPerPageRender.current = false;
      return;
    }
    setFiltersState((prev) => ({ ...prev, pageSize: itemsPerPage, page: 1 }));
  }, [itemsPerPage]);

  const refetch = useCallback(() => {
    const requestId = ++latestRequestId.current;
    setLoading(true);
    setError(undefined);
    getProjects(filters)
      .then((result) => {
        if (latestRequestId.current !== requestId || !mountedRef.current) return; // superseded by a newer request
        setProjects(result.projects);
        setTotal(result.total);
        setTotalPages(result.totalPages);
      })
      .catch((err) => {
        if (latestRequestId.current !== requestId || !mountedRef.current) return;
        setError(err.message);
      })
      .finally(() => {
        if (latestRequestId.current !== requestId || !mountedRef.current) return;
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
