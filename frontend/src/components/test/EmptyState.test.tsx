import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EmptyState from "../EmptyState.js";

describe("EmptyState", () => {
  it("renders properly with the empty-state message and clear-filters button", () => {
    render(
      <table>
        <tbody>
          <EmptyState onClear={() => {}} />
        </tbody>
      </table>
    );

    expect(screen.getByText("No audio files match your filters")).toBeInTheDocument();
    expect(screen.getByText("Try adjusting your search or filter criteria")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear all filters (no results)" })).toBeInTheDocument();
  });

  it("calls onClear when the clear-filters button is clicked", async () => {
    const onClear = vi.fn();
    const user = userEvent.setup();
    render(
      <table>
        <tbody>
          <EmptyState onClear={onClear} />
        </tbody>
      </table>
    );

    await user.click(screen.getByRole("button", { name: "Clear all filters (no results)" }));

    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
