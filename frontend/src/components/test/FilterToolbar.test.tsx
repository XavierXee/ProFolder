import { describe, expect, it, vi, afterEach } from "vitest";
import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FilterToolbar, { type FilterToolbarFilters, type FilterToolbarPatch } from "../FilterToolbar.js";

function Harness({
  initialFilters = {},
  allTags = [],
  selectedCount = 0,
  onOpenBatchPanel = () => {},
  onChangeSpy,
  locked,
  resultLabel = "10 files",
  sectionLabel,
}: {
  initialFilters?: FilterToolbarFilters;
  allTags?: string[];
  selectedCount?: number;
  onOpenBatchPanel?: () => void;
  onChangeSpy?: (patch: FilterToolbarPatch) => void;
  locked?: boolean;
  resultLabel?: string;
  sectionLabel?: string;
}) {
  const [filters, setFilters] = useState<FilterToolbarFilters>(initialFilters);

  function handleChange(patch: FilterToolbarPatch) {
    onChangeSpy?.(patch);
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  return (
    <FilterToolbar
      filters={filters}
      onChange={handleChange}
      allTags={allTags}
      resultLabel={resultLabel}
      searchPlaceholder="Search files or paths…"
      searchAriaLabel="Search by filename or path"
      sectionLabel={sectionLabel}
      selectedCount={selectedCount}
      onOpenBatchPanel={onOpenBatchPanel}
      locked={locked}
    />
  );
}

function getSearchInput() {
  return screen.getByRole("searchbox", { name: "Search by filename or path" });
}

// Note: @testing-library/user-event v14.6.7's documented `advanceTimers` fake-timer
// integration (`userEvent.setup({ advanceTimers: vi.advanceTimersByTime })`, with or
// without `delay: null`) hangs indefinitely in this repo's vitest 2.1.9 + jsdom
// environment (confirmed via an isolated repro: even a single `user.type()` call on a
// plain controlled <input>, no debounce logic involved, times out). Falling back to
// `fireEvent.change` + `vi.advanceTimersByTime` here, which is synchronous and doesn't
// depend on that integration, to exercise the same debounce behavior reliably.
describe("FilterToolbar - debounced search", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not call onChange while the debounce timer has not elapsed", () => {
    vi.useFakeTimers();
    const onChangeSpy = vi.fn();
    render(<Harness onChangeSpy={onChangeSpy} />);

    act(() => {
      fireEvent.change(getSearchInput(), { target: { value: "rock" } });
    });

    expect(onChangeSpy).not.toHaveBeenCalled();
  });

  it("calls onChange once, with the typed value, once the 250ms debounce elapses", () => {
    vi.useFakeTimers();
    const onChangeSpy = vi.fn();
    render(<Harness onChangeSpy={onChangeSpy} />);

    act(() => {
      fireEvent.change(getSearchInput(), { target: { value: "rock" } });
    });
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(onChangeSpy).toHaveBeenCalledTimes(1);
    expect(onChangeSpy).toHaveBeenCalledWith({ search: "rock" });
  });

  it("does not re-fire onChange when the input settles back on the current filters.search value", () => {
    vi.useFakeTimers();
    const onChangeSpy = vi.fn();
    render(<Harness initialFilters={{ search: "jazz" }} onChangeSpy={onChangeSpy} />);

    // Simulate clearing the field and retyping the same value it already had.
    act(() => {
      fireEvent.change(getSearchInput(), { target: { value: "" } });
    });
    act(() => {
      fireEvent.change(getSearchInput(), { target: { value: "jazz" } });
    });
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(onChangeSpy).not.toHaveBeenCalled();
  });

  it("emits search: undefined when the debounced value is cleared to empty", () => {
    vi.useFakeTimers();
    const onChangeSpy = vi.fn();
    render(<Harness initialFilters={{ search: "jazz" }} onChangeSpy={onChangeSpy} />);

    act(() => {
      fireEvent.change(getSearchInput(), { target: { value: "" } });
    });
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(onChangeSpy).toHaveBeenCalledTimes(1);
    expect(onChangeSpy).toHaveBeenCalledWith({ search: undefined });
  });
});

describe("FilterToolbar - clearAll", () => {
  it("resets the local search input to empty and emits every filter value as undefined", async () => {
    const onChangeSpy = vi.fn();
    const user = userEvent.setup();
    render(
      <Harness
        initialFilters={{
          search: "rock",
          statuses: ["draft"],
          scores: [5, "unscored"],
          tags: ["indie"],
          sortBy: "modifiedAt",
          sortDir: "asc",
        }}
        onChangeSpy={onChangeSpy}
      />
    );

    await user.click(screen.getByRole("button", { name: "Clear all filters" }));

    expect(onChangeSpy).toHaveBeenCalledWith({
      search: undefined,
      statuses: undefined,
      scores: undefined,
      tags: undefined,
      sortBy: undefined,
      sortDir: undefined,
    });
    expect(getSearchInput()).toHaveValue("");
  });
});

describe("FilterToolbar - Clear button disabled state (activeFilterCount)", () => {
  it("is disabled when there are no active filters", () => {
    render(<Harness />);

    expect(screen.getByRole("button", { name: "Clear all filters" })).toBeDisabled();
  });

  it("is enabled once a single filter (e.g. search) is active", () => {
    render(<Harness initialFilters={{ search: "rock" }} />);

    expect(screen.getByRole("button", { name: "Clear all filters" })).toBeEnabled();
  });

  it("is enabled with multiple active filters, and disabled again after Clear is clicked", async () => {
    const user = userEvent.setup();
    render(<Harness initialFilters={{ statuses: ["draft"], tags: ["indie"] }} />);
    const clearBtn = screen.getByRole("button", { name: "Clear all filters" });

    expect(clearBtn).toBeEnabled();

    await user.click(clearBtn);

    expect(clearBtn).toBeDisabled();
  });
});

describe("FilterToolbar - Batch Edit button", () => {
  it("is disabled when selectedCount is 0 or 1", () => {
    const { rerender } = render(<Harness selectedCount={0} />);
    expect(screen.getByRole("button", { name: /Batch Edit/ })).toBeDisabled();

    rerender(<Harness selectedCount={1} />);
    expect(screen.getByRole("button", { name: /Batch Edit/ })).toBeDisabled();
  });

  it("is enabled once selectedCount reaches 2, and shows the selection count", () => {
    render(<Harness selectedCount={2} />);

    const btn = screen.getByRole("button", { name: "Batch Edit (2)" });
    expect(btn).toBeEnabled();
  });

  it("calls onOpenBatchPanel when clicked while enabled", async () => {
    const onOpenBatchPanel = vi.fn();
    const user = userEvent.setup();
    render(<Harness selectedCount={3} onOpenBatchPanel={onOpenBatchPanel} />);

    await user.click(screen.getByRole("button", { name: "Batch Edit (3)" }));

    expect(onOpenBatchPanel).toHaveBeenCalledTimes(1);
  });

  it("shows the plain 'Batch Edit' label (no count) when selectedCount is 0", () => {
    render(<Harness selectedCount={0} />);

    expect(screen.getByRole("button", { name: "Batch Edit" })).toBeInTheDocument();
  });
});

describe("FilterToolbar - result label and status/score/tag dropdowns", () => {
  it("renders the provided resultLabel", () => {
    render(<Harness />);

    expect(screen.getByText("10 files")).toBeInTheDocument();
  });

  it("renders Status, Score, and Tags dropdown triggers", () => {
    render(<Harness allTags={["indie", "lofi"]} />);

    expect(screen.getByRole("button", { name: "Status" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Score" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tags" })).toBeInTheDocument();
  });

  it("reflects the number of selected tags in the Tags dropdown trigger", () => {
    render(<Harness allTags={["indie", "lofi"]} initialFilters={{ tags: ["indie"] }} />);

    expect(screen.getByRole("button", { name: "Tags (1)" })).toBeInTheDocument();
  });
});

describe("FilterToolbar - result label reserve-width span", () => {
  it("renders an invisible reserve span fixed to '999 of 999 projects', alongside the real visible label", () => {
    render(<Harness resultLabel="5 of 5 files" />);

    expect(screen.getByText("5 of 5 files")).toBeInTheDocument();
    const reserve = screen.getByText("999 of 999 projects");
    expect(reserve).toHaveAttribute("aria-hidden", "true");
    expect(reserve.className).toContain("invisible");
  });

  it("keeps the reserve label fixed at '999 of 999 projects' regardless of the resultLabel's digit counts", () => {
    render(<Harness resultLabel="42 of 128 projects" />);

    expect(screen.getByText("42 of 128 projects")).toBeInTheDocument();
    expect(screen.getByText("999 of 999 projects")).toBeInTheDocument();
  });

  it("keeps the reserve label fixed at '999 of 999 projects' for the '—' loading-state label too", () => {
    render(<Harness resultLabel="—" />);

    expect(screen.getByText("—")).toBeInTheDocument();
    const reserve = screen.getByText("999 of 999 projects");
    expect(reserve).toHaveAttribute("aria-hidden", "true");
  });

  it("uses the identical reserve text ('999 of 999 projects') whether resultLabel says 'files' or 'projects', so the box never resizes across tabs", () => {
    const { unmount } = render(<Harness resultLabel="5 of 5 files" />);
    const filesReserve = screen.getByText("999 of 999 projects");
    expect(filesReserve).toHaveAttribute("aria-hidden", "true");
    const filesReserveText = filesReserve.textContent;
    unmount();

    render(<Harness resultLabel="5 of 5 projects" />);
    const projectsReserve = screen.getByText("999 of 999 projects");
    expect(projectsReserve).toHaveAttribute("aria-hidden", "true");

    expect(projectsReserve.textContent).toBe(filesReserveText);
    expect(filesReserveText).toBe("999 of 999 projects");
  });
});

describe("FilterToolbar - locked mode", () => {
  it("does not render the Status, Score, or Tags dropdown triggers when locked", () => {
    render(<Harness locked allTags={["indie", "lofi"]} initialFilters={{ statuses: ["draft"], scores: [5], tags: ["indie"] }} />);

    expect(screen.queryByRole("button", { name: "Status" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Score" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Tags/ })).not.toBeInTheDocument();
  });

  it("still renders a functional search input when locked", () => {
    vi.useFakeTimers();
    const onChangeSpy = vi.fn();
    render(<Harness locked onChangeSpy={onChangeSpy} />);

    expect(getSearchInput()).toBeInTheDocument();

    act(() => {
      fireEvent.change(getSearchInput(), { target: { value: "rock" } });
    });
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(onChangeSpy).toHaveBeenCalledWith({ search: "rock" });
    vi.useRealTimers();
  });

  it("does not count non-empty statuses/scores/tags toward activeFilterCount when locked, so Clear stays disabled", () => {
    render(<Harness locked initialFilters={{ statuses: ["draft"], scores: [5, "unscored"], tags: ["indie"] }} />);

    expect(screen.getByRole("button", { name: "Clear all filters" })).toBeDisabled();
  });

  it("enables Clear when locked and search/sortBy are active, even with the locked baseline filters set", () => {
    render(
      <Harness
        locked
        initialFilters={{ statuses: ["draft"], scores: [5], tags: ["indie"], search: "rock", sortBy: "modifiedAt", sortDir: "asc" }}
      />
    );

    expect(screen.getByRole("button", { name: "Clear all filters" })).toBeEnabled();
  });

  it("clicking Clear when locked emits a patch with only search/sortBy/sortDir keys, omitting statuses/scores/tags entirely", async () => {
    const onChangeSpy = vi.fn();
    const user = userEvent.setup();
    render(
      <Harness
        locked
        initialFilters={{ statuses: ["draft"], scores: [5], tags: ["indie"], search: "rock", sortBy: "modifiedAt", sortDir: "asc" }}
        onChangeSpy={onChangeSpy}
      />
    );

    await user.click(screen.getByRole("button", { name: "Clear all filters" }));

    expect(onChangeSpy).toHaveBeenCalledWith({ search: undefined, sortBy: undefined, sortDir: undefined });
    const patch = onChangeSpy.mock.calls[0][0];
    expect(patch).not.toHaveProperty("statuses");
    expect(patch).not.toHaveProperty("scores");
    expect(patch).not.toHaveProperty("tags");
  });
});

describe("FilterToolbar - token-driven styling", () => {
  it("gives the toolbar container the surface/border token treatment", () => {
    const { container } = render(<Harness />);

    const toolbar = container.firstElementChild as HTMLElement;
    expect(toolbar.className).toContain("bg-surface");
    expect(toolbar.className).toContain("border-border");
  });

  it("gives the Batch Edit button the accent-fill treatment, and keeps disabled:opacity-30 working while disabled", () => {
    render(<Harness selectedCount={0} />);

    const btn = screen.getByRole("button", { name: "Batch Edit" });
    expect(btn.className).toContain("bg-accent");
    expect(btn.className).toContain("text-accent-ink");
    expect(btn.className).toContain("disabled:opacity-30");
    expect(btn).toBeDisabled();
  });

  it("keeps the accent-fill treatment on the Batch Edit button once it becomes enabled", () => {
    render(<Harness selectedCount={2} />);

    const btn = screen.getByRole("button", { name: "Batch Edit (2)" });
    expect(btn).toBeEnabled();
    expect(btn.className).toContain("bg-accent");
    expect(btn.className).toContain("text-accent-ink");
  });

  it("gives the Status/Score/Tags pickers and the Clear button the secondary token treatment", () => {
    render(<Harness allTags={["indie"]} initialFilters={{ search: "rock" }} />);

    const statusBtn = screen.getByRole("button", { name: "Status" });
    const scoreBtn = screen.getByRole("button", { name: "Score" });
    const tagsBtn = screen.getByRole("button", { name: "Tags" });
    const clearBtn = screen.getByRole("button", { name: "Clear all filters" });

    for (const btn of [statusBtn, scoreBtn, tagsBtn, clearBtn]) {
      expect(btn.className).toContain("bg-surface");
      expect(btn.className).toContain("text-ink-muted");
      expect(btn.className).toContain("border-border");
    }
  });

  it("renders sectionLabel unconditionally (present in the DOM regardless of theme), gated purely by the profolder CSS variant", () => {
    const { rerender } = render(<Harness sectionLabel="PROJECT FOLDERS" />);

    const label = screen.getByText("PROJECT FOLDERS");
    expect(label).toBeInTheDocument();
    expect(label.className).toContain("font-mono");
    expect(label.className).toContain("uppercase");
    // Base "hidden" + "profolder:inline" variant pair is what gates visibility per-theme via
    // CSS alone, not a JS isProFolder conditional -- the element itself is always in the DOM.
    expect(label.className).toContain("hidden");
    expect(label.className).toContain("profolder:inline");

    // sectionLabel omitted -> nothing extra rendered (data-driven, not theme-driven).
    rerender(<Harness />);
    expect(screen.queryByText("PROJECT FOLDERS")).not.toBeInTheDocument();
  });
});
