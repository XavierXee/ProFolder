import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TagChips } from "../TagChips.js";

describe("TagChips", () => {
  it("renders a dash placeholder when there are no tags", () => {
    render(<TagChips tags={[]} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByTestId("tag-chips")).not.toBeInTheDocument();
  });

  it("renders a single tag with no +N chip", () => {
    render(<TagChips tags={["rock"]} />);
    expect(screen.getByText("rock")).toBeInTheDocument();
    expect(screen.queryByTestId("tag-chips-more")).not.toBeInTheDocument();
  });

  it("shows only the first tag plus a +N chip counting the remaining tags", () => {
    render(<TagChips tags={["rock", "ambient", "lofi"]} />);

    expect(screen.getByText("rock")).toBeInTheDocument();
    expect(screen.queryByText("ambient")).not.toBeInTheDocument();
    expect(screen.queryByText("lofi")).not.toBeInTheDocument();

    const more = screen.getByTestId("tag-chips-more");
    expect(screen.getByText("+2")).toHaveAttribute("aria-hidden", "true");
    expect(more).toHaveAttribute("title", "ambient, lofi");
    expect(screen.getByText("2 more: ambient, lofi")).toHaveClass("sr-only");
  });
});
