import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StatusCatalogProvider, useStatusCatalog } from "../StatusCatalogContext.js";
import type { StatusDef } from "../../api/client.js";

vi.mock("../../api/client.js", () => ({
  getStatuses: vi.fn(),
}));

import * as api from "../../api/client.js";

const mockGetStatuses = vi.mocked(api.getStatuses);

beforeEach(() => {
  mockGetStatuses.mockReset();
});

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

/** Minimal consumer that surfaces the hook's return value in the DOM for assertions. */
function Consumer() {
  const { statuses, loading, refetch } = useStatusCatalog();
  return (
    <div>
      <div data-testid="loading">{String(loading)}</div>
      <div data-testid="statuses">{statuses.map((s) => s.key).join(",")}</div>
      <button onClick={() => refetch()}>refetch</button>
    </div>
  );
}

describe("StatusCatalogContext", () => {
  it("fetches the catalog once on mount", async () => {
    mockGetStatuses.mockResolvedValue([makeStatus({ key: "draft" }), makeStatus({ key: "done", name: "Done" })]);

    render(
      <StatusCatalogProvider>
        <Consumer />
      </StatusCatalogProvider>
    );

    expect(screen.getByTestId("loading")).toHaveTextContent("true");

    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));

    expect(screen.getByTestId("statuses")).toHaveTextContent("draft,done");
    expect(mockGetStatuses).toHaveBeenCalledTimes(1);
  });

  it("re-fetches when refetch() is called", async () => {
    mockGetStatuses.mockResolvedValueOnce([makeStatus({ key: "draft" })]);
    const user = userEvent.setup();

    render(
      <StatusCatalogProvider>
        <Consumer />
      </StatusCatalogProvider>
    );

    await waitFor(() => expect(screen.getByTestId("statuses")).toHaveTextContent("draft"));

    mockGetStatuses.mockResolvedValueOnce([makeStatus({ key: "draft" }), makeStatus({ key: "released", name: "Released" })]);

    await act(async () => {
      await user.click(screen.getByRole("button", { name: "refetch" }));
    });

    await waitFor(() => expect(screen.getByTestId("statuses")).toHaveTextContent("draft,released"));
    expect(mockGetStatuses).toHaveBeenCalledTimes(2);
  });

  it("provides a safe no-op default value ({ statuses: [], loading: false }) when used outside a Provider", () => {
    render(<Consumer />);

    expect(screen.getByTestId("loading")).toHaveTextContent("false");
    expect(screen.getByTestId("statuses")).toHaveTextContent("");
    expect(mockGetStatuses).not.toHaveBeenCalled();
  });
});
