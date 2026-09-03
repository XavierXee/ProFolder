import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useProjects } from "../useProjects.js";
import type { Project } from "../../types.js";
import type { PagedProjects } from "../../api/client.js";
import { PAGE_SIZE } from "../../constants.js";

vi.mock("../../api/client.js", () => ({
  getProjects: vi.fn(),
}));

import * as api from "../../api/client.js";

const mockGetProjects = vi.mocked(api.getProjects);

function makeProject(overrides: Partial<Project> = {}): Project & { audioFileCount: number } {
  return {
    id: "project-1",
    name: "My Project",
    path: "/music/My Project",
    hasVideo: false,
    hasImage: false,
    status: "unknown",
    tags: [],
    score: null,
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
    isRemoved: false,
    contentModifiedAt: null,
    audioFileCount: 0,
    ...overrides,
  };
}

function makePaged(overrides: Partial<PagedProjects> = {}): PagedProjects {
  return {
    projects: [],
    total: 0,
    page: 1,
    pageSize: PAGE_SIZE,
    totalPages: 1,
    ...overrides,
  };
}

/** Returns a promise plus its resolve/reject callbacks, for tests that need to
 * control exactly when a mocked fetch settles (e.g. simulating a race between
 * two in-flight requests). */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  mockGetProjects.mockReset().mockResolvedValue(makePaged());
});

describe("useProjects - initial state and shape", () => {
  it("returns the expected initial shape, then settles after the first fetch resolves", async () => {
    const project = makeProject();
    mockGetProjects.mockResolvedValue(makePaged({ projects: [project], total: 1, totalPages: 1 }));

    const { result } = renderHook(() => useProjects());

    expect(result.current.page).toBe(1);
    expect(result.current.pageSize).toBe(PAGE_SIZE);
    expect(result.current.loading).toBe(true);
    expect(result.current.projects).toEqual([]);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.projects).toEqual([project]);
    expect(result.current.total).toBe(1);
    expect(result.current.totalPages).toBe(1);
    expect(result.current.error).toBeUndefined();
    expect(mockGetProjects).toHaveBeenCalledWith({ page: 1, pageSize: PAGE_SIZE });
  });
});

describe("useProjects - updateFilters", () => {
  it("merges the patch into existing filters and resets page back to 1", async () => {
    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setPage(3);
    });
    await waitFor(() => expect(result.current.page).toBe(3));

    act(() => {
      result.current.updateFilters({ search: "beta" });
    });

    await waitFor(() => expect(result.current.filters.search).toBe("beta"));
    // page must be reset to 1 even though the caller only asked to change `search`.
    expect(result.current.page).toBe(1);
    expect(result.current.filters.page).toBe(1);
  });
});

describe("useProjects - setPage", () => {
  it("changes the page without clearing existing filters", async () => {
    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.updateFilters({ search: "alpha", sortBy: "name", sortDir: "asc" });
    });
    await waitFor(() => expect(result.current.filters.search).toBe("alpha"));

    act(() => {
      result.current.setPage(2);
    });

    await waitFor(() => expect(result.current.page).toBe(2));
    expect(result.current.filters.search).toBe("alpha");
    expect(result.current.filters.sortBy).toBe("name");
    expect(result.current.filters.sortDir).toBe("asc");
  });
});

describe("useProjects - refetch", () => {
  it("sets loading true during the fetch and clears it after", async () => {
    const { promise, resolve } = deferred<PagedProjects>();
    mockGetProjects.mockReturnValueOnce(promise);

    const { result } = renderHook(() => useProjects());

    expect(result.current.loading).toBe(true);

    resolve(makePaged());
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("populates error on a rejected fetch instead of crashing", async () => {
    mockGetProjects.mockReset().mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useProjects());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("network down");
    expect(result.current.projects).toEqual([]);
  });

  it("clears a previous error on a subsequent successful refetch", async () => {
    mockGetProjects.mockReset().mockRejectedValueOnce(new Error("network down"));

    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.error).toBe("network down"));

    mockGetProjects.mockResolvedValueOnce(makePaged());
    act(() => {
      result.current.refetch();
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeUndefined();
  });
});

describe("useProjects - stale-response guard (request-sequence race)", () => {
  it("discards a late-arriving response from a superseded request, keeping the newer request's data", async () => {
    const requestA = deferred<PagedProjects>();
    const requestB = deferred<PagedProjects>();

    // First call (mount's initial fetch) resolves immediately with an empty page so the
    // hook settles into a known state before we start the actual race.
    mockGetProjects.mockResolvedValueOnce(makePaged());

    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Request A: starts first.
    mockGetProjects.mockReturnValueOnce(requestA.promise);
    act(() => {
      result.current.refetch();
    });
    await waitFor(() => expect(mockGetProjects).toHaveBeenCalledTimes(2));

    // Request B: starts second, before A resolves.
    mockGetProjects.mockReturnValueOnce(requestB.promise);
    act(() => {
      result.current.refetch();
    });
    await waitFor(() => expect(mockGetProjects).toHaveBeenCalledTimes(3));

    const projectB = makeProject({ id: "project-b", name: "Project B" });
    const projectA = makeProject({ id: "project-a", name: "Project A" });

    // B resolves first...
    await act(async () => {
      requestB.resolve(makePaged({ projects: [projectB], total: 1 }));
      await Promise.resolve();
    });

    // ...then A's (older, now-stale) response arrives late.
    await act(async () => {
      requestA.resolve(makePaged({ projects: [projectA], total: 1 }));
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Final state must reflect B's data, not A's stale, late-arriving response.
    expect(result.current.projects).toEqual([projectB]);
    expect(result.current.total).toBe(1);
  });
});

describe("useProjects - page clamping", () => {
  it("clamps the current page back down when a filter change shrinks totalPages below it", async () => {
    mockGetProjects.mockResolvedValue(makePaged({ totalPages: 5 }));

    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setPage(5);
    });
    await waitFor(() => expect(result.current.page).toBe(5));

    // Next fetch (triggered by the page change) reports a shrunk result set.
    mockGetProjects.mockResolvedValue(makePaged({ totalPages: 2 }));
    act(() => {
      result.current.refetch();
    });

    await waitFor(() => expect(result.current.totalPages).toBe(2));
    await waitFor(() => expect(result.current.page).toBe(2));
  });
});
