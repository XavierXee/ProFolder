import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import StatusBadge from "../StatusBadge.js";
import { STATUS_BADGE, STATUS_LABELS } from "../../statusStyles.js";
import { StatusCatalogProvider } from "../../contexts/StatusCatalogContext.js";
import type { StatusDef } from "../../api/client.js";

vi.mock("../../api/client.js", () => ({
  getStatuses: vi.fn(),
}));

import * as api from "../../api/client.js";

const mockGetStatuses = vi.mocked(api.getStatuses);

function makeStatus(overrides: Partial<StatusDef> = {}): StatusDef {
  return {
    key: "draft",
    name: "Draft",
    color: "#a1b2c3",
    sortOrder: 1,
    createdAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("StatusBadge", () => {
  it("renders the 'unknown' sentinel unchanged, using the hardcoded STATUS_LABELS/STATUS_BADGE classes, with no catalog lookup", () => {
    render(<StatusBadge status="unknown" />);

    const badge = screen.getByLabelText("Status: Unknown");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent(STATUS_LABELS.unknown);
    for (const cls of STATUS_BADGE.unknown.split(" ")) {
      expect(badge.className).toContain(cls);
    }
  });

  it("renders a status found in the catalog with its name and a statusBadgeStyle-derived inline style", async () => {
    mockGetStatuses.mockResolvedValue([makeStatus({ key: "draft", name: "Draft", color: "#a1b2c3" })]);

    render(
      <StatusCatalogProvider>
        <StatusBadge status="draft" />
      </StatusCatalogProvider>
    );

    const badge = await waitFor(() => screen.getByLabelText("Status: Draft"));
    expect(badge).toHaveTextContent("Draft");
    // jsdom's CSSOM normalizes a `color-mix()` expression to its rgb() equivalent only when the
    // expression has no unresolved `var()` reference inside it — not based on which CSS property
    // it's assigned to (verified empirically: `borderColor` normalizes the same way `background
    // Color` does here). `statusBadgeStyle()`'s `backgroundColor`/`boxShadow` mix a plain hex
    // literal with no `var()` (#a1b2c3 -> rgb(161, 178, 195)), while `color` mixes in
    // `var(--color-ink)` and so stays a literal, unresolved string. jsdom doesn't compute
    // color-mix() itself either way, so none of these assertions confirm the resolved/rendered
    // color, only that the right hex made it into the right style string.
    expect(badge.style.backgroundColor).toContain("rgb(161, 178, 195)");
    expect(badge.style.color).toContain("#a1b2c3");
    expect(badge.style.boxShadow).toContain("#a1b2c3");
  });

  it("falls back to the raw key with the neutral 'unknown' style treatment for a status not present in the catalog (orphan value)", async () => {
    mockGetStatuses.mockResolvedValue([makeStatus({ key: "draft" })]);

    render(
      <StatusCatalogProvider>
        <StatusBadge status="some_deleted_status" />
      </StatusCatalogProvider>
    );

    await waitFor(() => expect(mockGetStatuses).toHaveBeenCalled());

    const badge = screen.getByLabelText("Status: some_deleted_status");
    expect(badge).toHaveTextContent("some_deleted_status");
    for (const cls of STATUS_BADGE.unknown.split(" ")) {
      expect(badge.className).toContain(cls);
    }
    expect(badge.style.backgroundColor).toBe("");
  });

  it("falls back to the neutral 'unknown' style treatment while the catalog is still loading", () => {
    // Never resolves during this test, so the catalog stays in its initial `loading` state.
    mockGetStatuses.mockReturnValue(new Promise(() => {}));

    render(
      <StatusCatalogProvider>
        <StatusBadge status="draft" />
      </StatusCatalogProvider>
    );

    const badge = screen.getByLabelText("Status: draft");
    expect(badge).toHaveTextContent("draft");
    for (const cls of STATUS_BADGE.unknown.split(" ")) {
      expect(badge.className).toContain(cls);
    }
  });

  // Covers all three render branches (unknown sentinel, found-in-catalog, orphan fallback) since
  // `className` is appended independently in each one.
  describe("optional className prop", () => {
    it("appends the given className alongside the default layout classes for the unknown sentinel", () => {
      render(<StatusBadge status="unknown" className="truncate" />);

      const badge = screen.getByLabelText("Status: Unknown");
      expect(badge.className).toContain("truncate");
      expect(badge.className).toContain("inline-flex");
    });

    it("appends the given className for a status found in the catalog", async () => {
      mockGetStatuses.mockResolvedValue([makeStatus({ key: "draft", name: "Draft" })]);

      render(
        <StatusCatalogProvider>
          <StatusBadge status="draft" className="truncate" />
        </StatusCatalogProvider>
      );

      const badge = await waitFor(() => screen.getByLabelText("Status: Draft"));
      expect(badge.className).toContain("truncate");
    });

    it("truncate swaps the inline-flex layout for a width-capped, ellipsizing inline-block", () => {
      render(<StatusBadge status="unknown" truncate />);

      const badge = screen.getByLabelText("Status: Unknown");
      expect(badge).toHaveClass("inline-block", "max-w-full", "truncate");
      expect(badge).not.toHaveClass("inline-flex");
    });

    it("truncate applies to a status found in the catalog too", async () => {
      mockGetStatuses.mockResolvedValue([makeStatus({ key: "draft", name: "Draft" })]);

      render(
        <StatusCatalogProvider>
          <StatusBadge status="draft" truncate />
        </StatusCatalogProvider>
      );

      const badge = await waitFor(() => screen.getByLabelText("Status: Draft"));
      expect(badge).toHaveClass("inline-block", "truncate");
      expect(badge).not.toHaveClass("inline-flex");
    });

    it("renders with no trailing-space artifacts when className is omitted", () => {
      render(<StatusBadge status="unknown" />);

      const badge = screen.getByLabelText("Status: Unknown");
      expect(badge.className.endsWith(" ")).toBe(false);
    });
  });
});
