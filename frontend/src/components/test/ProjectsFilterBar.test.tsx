import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProjectsFilterBar from "../ProjectsFilterBar.js";
import { PAGE_SIZE } from "../../constants.js";

describe("ProjectsFilterBar", () => {
  it("forwards to FilterToolbar with the projects-specific search placeholder and aria-label", () => {
    render(
      <ProjectsFilterBar
        filters={{ page: 1, pageSize: PAGE_SIZE }}
        onChange={vi.fn()}
        allTags={[]}
        resultLabel="5 projects"
        selectedCount={0}
        onOpenBatchPanel={vi.fn()}
      />
    );

    const input = screen.getByRole("searchbox", { name: "Search project folders" });
    expect(input).toHaveAttribute("placeholder", "Search project folders…");
    expect(screen.getByText("5 projects")).toBeInTheDocument();
  });

  it("forwards selectedCount and onOpenBatchPanel through to the Batch Edit button", async () => {
    const onOpenBatchPanel = vi.fn();
    const user = userEvent.setup();
    render(
      <ProjectsFilterBar
        filters={{ page: 1, pageSize: PAGE_SIZE }}
        onChange={vi.fn()}
        allTags={[]}
        resultLabel="5 projects"
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
      <ProjectsFilterBar
        filters={{ page: 1, pageSize: PAGE_SIZE }}
        onChange={onChange}
        allTags={[]}
        resultLabel="5 projects"
        selectedCount={0}
        onOpenBatchPanel={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Status" }));
    // "Unknown" is the one status option always present regardless of the (dynamic, catalog-
    // sourced) rest of the list — see StatusCatalogContext.tsx — so this doesn't need a
    // StatusCatalogProvider/mocked catalog just to verify plain onChange forwarding.
    await user.click(screen.getByRole("checkbox", { name: "Unknown" }));

    expect(onChange).toHaveBeenCalledWith({ statuses: ["unknown"] });
  });
});
