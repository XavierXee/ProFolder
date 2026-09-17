import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import StatusBadge from "../StatusBadge.js";
import { STATUS_BADGE } from "../../statusStyles.js";
import type { TrackStatus } from "../../types.js";

describe("StatusBadge", () => {
  it("renders the label and aria-label for a given status", () => {
    render(<StatusBadge status="needs_mixing" />);

    const badge = screen.getByLabelText("Status: Need Mixing");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("Need Mixing");
  });

  const statuses: TrackStatus[] = ["unknown", "draft", "needs_mixing", "done", "released"];

  it.each(statuses)("applies the STATUS_BADGE token class for status '%s'", (status) => {
    render(<StatusBadge status={status} />);

    const badge = screen.getByLabelText(new RegExp(`^Status: `));
    expect(badge.className).toContain(STATUS_BADGE[status]);
  });
});
