import { describe, expect, it } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MultiSelectDropdown } from "../MultiSelectDropdown.js";

const OPTIONS = [
  { value: "rock", label: "Rock" },
  { value: "jazz", label: "Jazz" },
];

function Harness({
  options = OPTIONS,
  initialSelected = [],
  reserveLabel,
}: {
  options?: { value: string; label: string }[];
  initialSelected?: string[];
  reserveLabel?: string;
}) {
  const [selected, setSelected] = useState<string[]>(initialSelected);
  return (
    <MultiSelectDropdown
      label="Status"
      options={options}
      selected={selected}
      onChange={setSelected}
      isDark={true}
      reserveLabel={reserveLabel}
    />
  );
}

describe("MultiSelectDropdown", () => {
  it("renders properly, closed, with the plain label and no menu", () => {
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: "Status" });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("opens the option list on trigger click", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Status" }));

    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Rock" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Jazz" })).toBeInTheDocument();
  });

  it("toggle adds an option to the selection and removes it again on a second click", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Status" }));

    await user.click(screen.getByRole("checkbox", { name: "Rock" }));
    expect(screen.getByRole("checkbox", { name: "Rock" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Status (1)" })).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Rock" }));
    expect(screen.getByRole("checkbox", { name: "Rock" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Status" })).toBeInTheDocument();
  });

  it("shows a (n) selected-count suffix in the trigger label for multiple selections", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Status" }));

    await user.click(screen.getByRole("checkbox", { name: "Rock" }));
    await user.click(screen.getByRole("checkbox", { name: "Jazz" }));

    expect(screen.getByRole("button", { name: "Status (2)" })).toBeInTheDocument();
  });

  it("closes the dropdown on an outside click", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <div data-testid="outside">Outside</div>
        <Harness />
      </div>
    );
    await user.click(screen.getByRole("button", { name: "Status" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await user.click(screen.getByTestId("outside"));

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes the dropdown on Escape", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Status" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("falls back to the plain label for the width-reserving span when reserveLabel is omitted", () => {
    render(<Harness />);

    // Both the (aria-hidden) width-reserving span and the visible label span render "Status".
    expect(screen.getAllByText("Status")).toHaveLength(2);
  });

  it("uses reserveLabel for the width-reserving span when provided", () => {
    render(<Harness reserveLabel="Status (5)" />);

    expect(screen.getByText("Status (5)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Status" })).toBeInTheDocument();
  });

  it('renders "No options" and no checkboxes when the options list is empty', async () => {
    const user = userEvent.setup();
    render(<Harness options={[]} />);

    await user.click(screen.getByRole("button", { name: "Status" }));

    expect(screen.getByText("No options")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
