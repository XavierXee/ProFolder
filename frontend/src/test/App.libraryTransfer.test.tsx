import { beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { render, screen } from "@testing-library/react";
import App from "../App.js";

// Every call App makes on mount must resolve (see App.audioPlayer.test.tsx's note on why).
vi.mock("../api/client.js", () => ({
  getFiles: vi.fn().mockResolvedValue({ files: [], total: 0, totalDurationSeconds: 0, page: 1, pageSize: 50, totalPages: 1 }),
  getProjects: vi.fn().mockResolvedValue({ projects: [], total: 0, page: 1, pageSize: 50, totalPages: 1 }),
  getConfig: vi.fn().mockResolvedValue({ musicRoot: "/music", runtimeMode: "web" }),
  getLastScan: vi.fn().mockResolvedValue(undefined),
  getStats: vi.fn().mockResolvedValue({ files: { total: 0, byStatus: {} }, projects: { total: 0, byStatus: {} } }),
  getAllTags: vi.fn().mockResolvedValue([]),
  getStatuses: vi.fn().mockResolvedValue([]),
  getCustomTabs: vi.fn().mockResolvedValue([]),
  getPaginationSettings: vi.fn().mockResolvedValue({ itemsPerPage: 50 }),
  exportLibrary: vi.fn(),
  importLibrary: vi.fn(),
}));

beforeEach(() => {
  sessionStorage.clear();
});

describe("App - library export and import buttons", () => {
  it("places Export then Import between the Metrics and Settings buttons", () => {
    render(<App />);

    const order = ["Metrics", "Export library", "Import library", "Settings"].map((name) =>
      screen.getByRole("button", { name })
    );
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("shows the summary of an import that just reloaded the app, once", async () => {
    sessionStorage.setItem("musicLibraryManager.importMessage", "Import complete: 2 tags added.");
    const { unmount } = render(
      <StrictMode>
        <App />
      </StrictMode>
    );
    expect(await screen.findByText("Import complete: 2 tags added.")).toBeInTheDocument();
    unmount();

    render(<App />);
    await screen.findByRole("button", { name: "Settings" });
    expect(screen.queryByText("Import complete: 2 tags added.")).not.toBeInTheDocument();
  });
});
