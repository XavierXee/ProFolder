import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import StatusBadge from "../StatusBadge.js";

describe("StatusBadge", () => {
  it("renders the label and aria-label for a given status", () => {
    render(<StatusBadge status="needs_mixing" />);

    const badge = screen.getByLabelText("Status: Need Mixing");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("Need Mixing");
  });

  it("applies the dark badge styling by default", () => {
    render(<StatusBadge status="done" />);

    const badge = screen.getByLabelText("Status: Done");
    expect(badge.className).toContain("bg-emerald-500/15");
  });

  it("applies the light badge styling when isDark is false", () => {
    render(<StatusBadge status="done" isDark={false} />);

    const badge = screen.getByLabelText("Status: Done");
    expect(badge.className).toContain("bg-emerald-100");
  });
});
