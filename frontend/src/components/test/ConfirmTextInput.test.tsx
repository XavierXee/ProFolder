import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConfirmTextInput from "../ConfirmTextInput.js";

describe("ConfirmTextInput - label", () => {
  it("renders the default label containing expectedText when no label prop is provided", () => {
    render(<ConfirmTextInput expectedText="DELETE" value="" onChange={() => {}} />);

    expect(screen.getByText('Type "DELETE" to confirm')).toBeInTheDocument();
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
