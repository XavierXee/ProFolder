import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RowCheckbox } from "../RowCheckbox.js";

describe("RowCheckbox", () => {
  it("renders properly, unchecked with the given aria-label", () => {
    render(<RowCheckbox checked={false} onChange={() => {}} ariaLabel="Select track" />);

    const checkbox = screen.getByLabelText("Select track");
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();
  });

  it("renders checked when checked is true", () => {
    render(<RowCheckbox checked={true} onChange={() => {}} ariaLabel="Select track" />);

    expect(screen.getByLabelText("Select track")).toBeChecked();
  });

  it("calls onChange when clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<RowCheckbox checked={false} onChange={onChange} ariaLabel="Select track" />);

    await user.click(screen.getByLabelText("Select track"));

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("stops the click from propagating to an ancestor's onClick handler", async () => {
    const onChange = vi.fn();
    const ancestorClick = vi.fn();
    const user = userEvent.setup();

    render(
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
      <div onClick={ancestorClick}>
        <RowCheckbox checked={false} onChange={onChange} ariaLabel="Select track" />
      </div>
    );

    await user.click(screen.getByLabelText("Select track"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(ancestorClick).not.toHaveBeenCalled();
  });
});
