import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConfirmTextInput from "../ConfirmTextInput.js";

describe("ConfirmTextInput - label", () => {
  it("renders the default label containing expectedText when no label prop is provided", () => {
    render(<ConfirmTextInput expectedText="DELETE" value="" onChange={() => {}} />);

    // The visible label's text is split across a nested element (see the next test) so its
    // rendered content doesn't exactly match `getByText`'s default single-node matching — check
    // the label's own aggregated textContent instead, which is what a sighted user actually sees.
    const label = document.querySelector("label");
    expect(label).toHaveTextContent('Type "DELETE" to confirm');
  });

  it("preserves expectedText's real casing in a normal-case span, even though the rest of the label is visually uppercased", () => {
    render(<ConfirmTextInput expectedText="Draft" value="" onChange={() => {}} />);

    const label = document.querySelector("label");
    expect(label).toHaveClass("uppercase");
    const preserved = screen.getByText("Draft");
    expect(preserved.tagName).toBe("SPAN");
    expect(preserved).toHaveClass("normal-case");
    // Sanity check: nothing anywhere renders the misleadingly-uppercased "DRAFT" as text content.
    expect(screen.queryByText("DRAFT")).not.toBeInTheDocument();
  });

  it("renders a custom label when provided, instead of the default", () => {
    render(
      <ConfirmTextInput
        expectedText="my-tab"
        value=""
        onChange={() => {}}
        label="Confirm the tab name"
      />
    );

    expect(screen.getByText("Confirm the tab name")).toBeInTheDocument();
    expect(screen.queryByText('Type "my-tab" to confirm')).not.toBeInTheDocument();
  });

  it("associates the label with the input so it has an accessible name", () => {
    render(<ConfirmTextInput expectedText="DELETE" value="" onChange={() => {}} />);

    expect(screen.getByRole("textbox", { name: /type "delete" to confirm/i })).toBeInTheDocument();
  });
});

describe("ConfirmTextInput - typing", () => {
  it("calls onChange with the typed value as the user types", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ConfirmTextInput expectedText="DELETE" value="" onChange={onChange} />);

    const input = screen.getByRole("textbox", { name: /type "delete" to confirm/i });
    await user.type(input, "D");

    expect(onChange).toHaveBeenCalledWith("D");
  });
});

describe("ConfirmTextInput - autoFocus", () => {
  it("does not autofocus the input by default", () => {
    render(<ConfirmTextInput expectedText="DELETE" value="" onChange={() => {}} />);

    const input = screen.getByRole("textbox", { name: /type "delete" to confirm/i });
    expect(input).not.toHaveFocus();
  });

  it("autofocuses the input when autoFocus is explicitly true", () => {
    render(<ConfirmTextInput expectedText="DELETE" value="" onChange={() => {}} autoFocus />);

    const input = screen.getByRole("textbox", { name: /type "delete" to confirm/i });
    expect(input).toHaveFocus();
  });
});

describe("ConfirmTextInput - disabled", () => {
  it("is not disabled by default", () => {
    render(<ConfirmTextInput expectedText="DELETE" value="" onChange={() => {}} />);

    const input = screen.getByRole("textbox", { name: /type "delete" to confirm/i });
    expect(input).not.toBeDisabled();
  });

  it("renders as disabled when the disabled prop is true", () => {
    render(<ConfirmTextInput expectedText="DELETE" value="" onChange={() => {}} disabled />);

    const input = screen.getByRole("textbox", { name: /type "delete" to confirm/i });
    expect(input).toBeDisabled();
  });
});
