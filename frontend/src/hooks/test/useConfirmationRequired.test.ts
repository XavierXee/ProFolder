import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useConfirmationRequired } from "../useConfirmationRequired.js";
import type { ConfirmationSettings } from "../../api/client.js";

vi.mock("../../api/client.js", () => ({
  getConfirmationSettings: vi.fn(),
}));

import * as api from "../../api/client.js";

const mockGetConfirmationSettings = vi.mocked(api.getConfirmationSettings);

function makeSettings(overrides: Partial<ConfirmationSettings> = {}): ConfirmationSettings {
  return {
    confirmTagRemoval: false,
    confirmTabDeletion: false,
    confirmCopy: false,
    confirmMove: false,
    confirmDelete: false,
    confirmStatusDeletion: false,
    confirmTagDeletion: false,
    ...overrides,
  };
}

beforeEach(() => {
  mockGetConfirmationSettings.mockReset();
});

describe("useConfirmationRequired - fail-safe while loading", () => {
  it("returns true (required) while the fetch is still in flight", () => {
    mockGetConfirmationSettings.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useConfirmationRequired("confirmTagRemoval", true));

    expect(result.current).toBe(true);
  });

  it("does not call the API at all while active is false", () => {
    mockGetConfirmationSettings.mockResolvedValue(makeSettings());
    renderHook(() => useConfirmationRequired("confirmTagRemoval", false));

    expect(mockGetConfirmationSettings).not.toHaveBeenCalled();
  });
});

describe("useConfirmationRequired - resolved value", () => {
  it("returns true once settings resolve with the field true", async () => {
    mockGetConfirmationSettings.mockResolvedValue(makeSettings({ confirmTagRemoval: true }));
    const { result } = renderHook(() => useConfirmationRequired("confirmTagRemoval", true));

    await waitFor(() => expect(result.current).toBe(true));
  });

  it("returns false once settings resolve with the field false", async () => {
    mockGetConfirmationSettings.mockResolvedValue(makeSettings({ confirmTagRemoval: false }));
    const { result } = renderHook(() => useConfirmationRequired("confirmTagRemoval", true));

    await waitFor(() => expect(result.current).toBe(false));
  });
});

describe("useConfirmationRequired - re-fetch on active transition", () => {
  it("re-fetches fresh every time active transitions from false back to true, not just once ever", async () => {
    mockGetConfirmationSettings.mockResolvedValueOnce(makeSettings({ confirmTagRemoval: false }));
    const { result, rerender } = renderHook(({ active }) => useConfirmationRequired("confirmTagRemoval", active), {
      initialProps: { active: true },
    });

    await waitFor(() => expect(result.current).toBe(false));
    expect(mockGetConfirmationSettings).toHaveBeenCalledTimes(1);

    // Deactivate, then reactivate — should trigger a fresh fetch reflecting a settings change
    // made in between (e.g. via the Settings panel), not the stale first-fetch value.
    rerender({ active: false });
    mockGetConfirmationSettings.mockResolvedValueOnce(makeSettings({ confirmTagRemoval: true }));
    rerender({ active: true });

    await waitFor(() => expect(result.current).toBe(true));
    expect(mockGetConfirmationSettings).toHaveBeenCalledTimes(2);
  });

  it("returns to the fail-safe true value immediately upon reactivation, before the fresh fetch resolves", async () => {
    mockGetConfirmationSettings.mockResolvedValueOnce(makeSettings({ confirmTagRemoval: false }));
    const { result, rerender } = renderHook(({ active }) => useConfirmationRequired("confirmTagRemoval", active), {
      initialProps: { active: true },
    });

    await waitFor(() => expect(result.current).toBe(false));

    rerender({ active: false });
    mockGetConfirmationSettings.mockReturnValue(new Promise(() => {}));
    rerender({ active: true });

    expect(result.current).toBe(true);
  });
});
