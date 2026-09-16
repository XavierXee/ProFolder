import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FilterBar, { DEFAULT_FILTERS } from "../FilterBar.js";
import { PAGE_SIZE } from "../../constants.js";

describe("DEFAULT_FILTERS", () => {
  it("defaults to page 1 at the shared PAGE_SIZE", () => {
    expect(DEFAULT_FILTERS).toEqual({ page: 1, pageSize: PAGE_SIZE });
  });
});

describe("FilterBar", () => {
  it("forwards to FilterToolbar with the files-specific search placeholder and aria-label", () => {
    render(
      <FilterBar
        filters={{ page: 1, pageSize: PAGE_SIZE }}
        onChange={vi.fn()}
        allTags={[]}
        isDark={true}
        resultLabel="3 files"
        selectedCount={0}
        onOpenBatchPanel={vi.fn()}
      />
    );

    const input = screen.getByRole("searchbox", { name: "Search by filename or path" });
    expect(input).toHaveAttribute("placeholder", "Search files or paths…");
    expect(screen.getByText("3 files")).toBeInTheDocument();
  });

  it("forwards selectedCount and onOpenBatchPanel through to the Batch Edit button", async () => {
    const onOpenBatchPanel = vi.fn();
    const user = userEvent.setup();
    render(
      <FilterBar
        filters={{ page: 1, pageSize: PAGE_SIZE }}
        onChange={vi.fn()}
        allTags={[]}
        isDark={true}
        resultLabel="3 files"
        selectedCount={2}
        onOpenBatchPanel={onOpenBatchPanel}
      />
    );

    await user.click(screen.getByRole("button", { name: "Batch Edit (2)" }));

    expect(onOpenBatchPanel).toHaveBeenCalledTimes(1);
  });

  it("forwards onChange for a filter update (e.g. a Status toggle)", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <FilterBar
        filters={{ page: 1, pageSize: PAGE_SIZE }}
        onChange={onChange}
        allTags={[]}
        isDark={true}
        resultLabel="3 files"
        selectedCount={0}
        onOpenBatchPanel={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Status" }));
    await user.click(screen.getByRole("checkbox", { name: "Draft" }));

    expect(onChange).toHaveBeenCalledWith({ statuses: ["draft"] });
  });

  it("passes isProFolder through and renders the 'AUDIO FILES' sectionLabel when isProFolder is true", () => {
    render(
      <FilterBar
        filters={{ page: 1, pageSize: PAGE_SIZE }}
        onChange={vi.fn()}
        allTags={[]}
        isDark={true}
        isProFolder={true}
        resultLabel="3 files"
        selectedCount={0}
        onOpenBatchPanel={vi.fn()}
      />
    );

    expect(screen.getByText("AUDIO FILES")).toBeInTheDocument();
  });

  it("does not render the sectionLabel when isProFolder is false (default)", () => {
    render(
      <FilterBar
        filters={{ page: 1, pageSize: PAGE_SIZE }}
        onChange={vi.fn()}
        allTags={[]}
        isDark={true}
        resultLabel="3 files"
        selectedCount={0}
        onOpenBatchPanel={vi.fn()}
      />
    );

    expect(screen.queryByText("AUDIO FILES")).not.toBeInTheDocument();
  });
});
