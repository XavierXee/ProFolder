import { useCallback, useEffect, useState } from "react";
import type { AudioFile } from "../types.js";
import { getFiles, type FileFilters } from "../api/client.js";

const DEFAULT_PAGE_SIZE = 50;

export function useAudioFiles() {
  const [files, setFiles] = useState<AudioFile[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFiltersState] = useState<FileFilters>({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  const refetch = useCallback(() => {
    setLoading(true);
    setError(undefined);
    getFiles(filters)
      .then((result) => {
        setFiles(result.files);
        setTotal(result.total);
        setTotalPages(result.totalPages);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [filters]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // If edits/rescans shrink the result set, clamp back onto the last page that still has data.
  useEffect(() => {
    setFiltersState((prev) => {
      const currentPage = prev.page ?? 1;
      return currentPage > totalPages ? { ...prev, page: totalPages } : prev;
    });
  }, [totalPages]);

  /** Updates search/status/export/sort filters and resets to page 1, since the previous page may no longer exist. */
  const updateFilters = useCallback((patch: Omit<FileFilters, "page" | "pageSize">) => {
    setFiltersState((prev) => ({ ...prev, ...patch, page: 1 }));
  }, []);

  const setPage = useCallback((page: number) => {
    setFiltersState((prev) => ({ ...prev, page }));
  }, []);

  return {
    files,
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
