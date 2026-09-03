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
}: {
  initialFilters?: FilterToolbarFilters;
  allTags?: string[];
  selectedCount?: number;
  onOpenBatchPanel?: () => void;
  onChangeSpy?: (patch: FilterToolbarPatch) => void;
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
      isDark={true}
      resultLabel="10 files"
      searchPlaceholder="Search files or paths…"
      searchAriaLabel="Search by filename or path"
      selectedCount={selectedCount}
      onOpenBatchPanel={onOpenBatchPanel}
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

describe("FilterToolbar - Modified sort toggle", () => {
  function getSortButton() {
    return screen.getByRole("button", { name: /Sort: Modified/ });
  }

  it("sets sortBy=modifiedAt and sortDir=asc on the first click", async () => {
    const onChangeSpy = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChangeSpy={onChangeSpy} />);

    await user.click(getSortButton());

    expect(onChangeSpy).toHaveBeenCalledWith({ sortBy: "modifiedAt", sortDir: "asc" });
    expect(getSortButton()).toHaveAttribute("aria-pressed", "true");
  });

  it("flips asc -> desc -> asc on repeated clicks", async () => {
    const onChangeSpy = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChangeSpy={onChangeSpy} />);
    const button = getSortButton();

    await user.click(button);
    expect(onChangeSpy).toHaveBeenNthCalledWith(1, { sortBy: "modifiedAt", sortDir: "asc" });

    await user.click(button);
    expect(onChangeSpy).toHaveBeenNthCalledWith(2, { sortBy: "modifiedAt", sortDir: "desc" });

    await user.click(button);
    expect(onChangeSpy).toHaveBeenNthCalledWith(3, { sortBy: "modifiedAt", sortDir: "asc" });
  });

  it("is not aria-pressed and not active when no sort is applied", () => {
    render(<Harness />);

    expect(getSortButton()).toHaveAttribute("aria-pressed", "false");
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
