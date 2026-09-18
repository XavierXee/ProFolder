import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { PAGE_SIZE } from "../../constants.js";

vi.mock("../../api/client.js", () => ({
  getPaginationSettings: vi.fn(),
}));

import * as api from "../../api/client.js";

const mockGetPaginationSettings = vi.mocked(api.getPaginationSettings);

beforeEach(() => {
  // The hook module keeps `cachedValue`/`listeners` as module-level singletons by design
  // (that's what makes cross-instance pub-sub work in production). Within a single test
  // file, vitest only isolates modules *per file*, not per test, so without resetting the
  // module registry here, the second test's `resolveValue`/mock would never actually be
  // consulted -- fetchOnce() would short-circuit on the first test's already-cached value.
  // vi.resetModules() plus a fresh dynamic `import(...)` per test gives each test its own
  // clean singleton instance.
  vi.resetModules();
  mockGetPaginationSettings.mockReset();
});

describe("useItemsPerPage", () => {
  it("starts at the hardcoded PAGE_SIZE default before the fetch resolves", async () => {
    let resolveSettings!: (settings: { itemsPerPage: number }) => void;
    mockGetPaginationSettings.mockReturnValue(
      new Promise((resolve) => {
        resolveSettings = resolve;
      })
    );

    const { useItemsPerPage } = await import("../useItemsPerPage.js");
    const { result } = renderHook(() => useItemsPerPage());

    expect(result.current).toBe(PAGE_SIZE);

    // settle the pending fetch so this test doesn't leak a dangling promise into the next one
    resolveSettings({ itemsPerPage: PAGE_SIZE });
    await waitFor(() => expect(result.current).toBe(PAGE_SIZE));
  });

  it("updates to the fetched value once the settings request resolves", async () => {
    mockGetPaginationSettings.mockResolvedValue({ itemsPerPage: 123 });

    const { useItemsPerPage } = await import("../useItemsPerPage.js");
    const { result } = renderHook(() => useItemsPerPage());

    await waitFor(() => expect(result.current).toBe(123));
  });

  it("propagates a value change live to a second, independently-mounted hook instance when setItemsPerPageGlobally is called by a third party", async () => {
    mockGetPaginationSettings.mockResolvedValue({ itemsPerPage: 50 });

    const { useItemsPerPage, setItemsPerPageGlobally } = await import("../useItemsPerPage.js");

    const first = renderHook(() => useItemsPerPage());
    const second = renderHook(() => useItemsPerPage());

    // Both instances settle on the initially-fetched value first.
    await waitFor(() => expect(first.result.current).toBe(50));
    await waitFor(() => expect(second.result.current).toBe(50));

    act(() => {
      setItemsPerPageGlobally(200);
    });

    // Both mounted instances react instantly to the same global update -- this is the
    // actual cross-tab "Apply button" feature being proven, not just the pub-sub plumbing
    // in isolation.
    expect(first.result.current).toBe(200);
    expect(second.result.current).toBe(200);
  });
});
