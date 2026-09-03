import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pagination } from "../Pagination.js";

describe("Pagination", () => {
  it("renders properly, showing the start-end/total range and current page", () => {
    render(<Pagination page={2} totalPages={5} total={100} pageSize={20} isDark={true} onPageChange={() => {}} />);

    expect(screen.getByText("21–40 of 100")).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 5")).toBeInTheDocument();
  });

  it("shows 'No files' when total is 0", () => {
    render(<Pagination page={1} totalPages={1} total={0} pageSize={20} isDark={true} onPageChange={() => {}} />);

    expect(screen.getByText("No files")).toBeInTheDocument();
  });

  it("disables first/prev but not next/last on the first page", () => {
    render(<Pagination page={1} totalPages={5} total={100} pageSize={20} isDark={true} onPageChange={() => {}} />);

    expect(screen.getByRole("button", { name: "«" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "‹ Prev" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next ›" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "»" })).toBeEnabled();
  });

  it("disables next/last but not first/prev on the last page", () => {
    render(<Pagination page={5} totalPages={5} total={100} pageSize={20} isDark={true} onPageChange={() => {}} />);

    expect(screen.getByRole("button", { name: "«" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "‹ Prev" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next ›" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "»" })).toBeDisabled();
  });

  it("disables all navigation buttons when there is only a single page", () => {
    render(<Pagination page={1} totalPages={1} total={0} pageSize={20} isDark={true} onPageChange={() => {}} />);

    expect(screen.getByRole("button", { name: "«" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "‹ Prev" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next ›" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "»" })).toBeDisabled();
  });

  it("calls onPageChange with the target page for each navigation button", async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    render(<Pagination page={2} totalPages={5} total={100} pageSize={20} isDark={true} onPageChange={onPageChange} />);

    await user.click(screen.getByRole("button", { name: "«" }));
    expect(onPageChange).toHaveBeenLastCalledWith(1);

    await user.click(screen.getByRole("button", { name: "‹ Prev" }));
    expect(onPageChange).toHaveBeenLastCalledWith(1);

    await user.click(screen.getByRole("button", { name: "Next ›" }));
    expect(onPageChange).toHaveBeenLastCalledWith(3);

    await user.click(screen.getByRole("button", { name: "»" }));
    expect(onPageChange).toHaveBeenLastCalledWith(5);

    expect(onPageChange).toHaveBeenCalledTimes(4);
  });

  it("uses the dark border/text styling by default", () => {
    const { container } = render(
      <Pagination page={2} totalPages={5} total={100} pageSize={20} isDark={true} onPageChange={() => {}} />
    );

    expect(container.firstChild).toHaveProperty(
      "className",
      expect.stringContaining("border-white/8")
    );
  });
});
