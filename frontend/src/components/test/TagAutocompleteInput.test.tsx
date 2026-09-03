import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TagAutocompleteInput, filterSuggestions } from "../TagAutocompleteInput.js";

function Harness({
  suggestions,
  onCommit,
  onBlur,
  initialValue = "",
}: {
  suggestions: string[];
  onCommit: (value: string) => void;
  onBlur?: () => void;
  initialValue?: string;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <TagAutocompleteInput value={value} onChange={setValue} onCommit={onCommit} onBlur={onBlur} suggestions={suggestions} />
  );
}

describe("filterSuggestions", () => {
  it("returns an empty array for an empty or whitespace-only query", () => {
    expect(filterSuggestions("", ["rock", "jazz"])).toEqual([]);
    expect(filterSuggestions("   ", ["rock", "jazz"])).toEqual([]);
  });

  it("matches case-insensitively by substring", () => {
    expect(filterSuggestions("RO", ["rock", "jazz", "Rome"])).toEqual(["rock", "Rome"]);
  });

  it("excludes suggestions that do not contain the query", () => {
    expect(filterSuggestions("zz", ["rock", "jazz"])).toEqual(["jazz"]);
  });

  it("caps results at 8", () => {
    const many = Array.from({ length: 20 }, (_, i) => `tag${i}`);
    const result = filterSuggestions("tag", many);
    expect(result).toHaveLength(8);
    expect(result).toEqual(many.slice(0, 8));
  });
});

describe("TagAutocompleteInput", () => {
  it("renders properly with the placeholder and a closed, empty combobox", () => {
    render(<Harness suggestions={["rock", "jazz"]} onCommit={() => {}} />);

    const input = screen.getByRole("combobox");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("placeholder", "Add tag, press Enter…");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("shows a case-insensitive filtered suggestion list while typing", async () => {
    const user = userEvent.setup();
    render(<Harness suggestions={["Rock", "Jazz", "Punk"]} onCommit={() => {}} />);

    await user.type(screen.getByRole("combobox"), "ro");

    expect(screen.getByRole("option", { name: "Rock" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Jazz" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Punk" })).not.toBeInTheDocument();
  });

  it("ArrowDown navigation wraps from the last suggestion back to the first", async () => {
    const user = userEvent.setup();
    render(<Harness suggestions={["a1", "a2", "a3"]} onCommit={() => {}} />);
    await user.type(screen.getByRole("combobox"), "a");

    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(screen.getByRole("option", { name: "a3" })).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: "a1" })).toHaveAttribute("aria-selected", "true");
  });

  it("ArrowUp navigation wraps from the first suggestion back to the last", async () => {
    const user = userEvent.setup();
    render(<Harness suggestions={["a1", "a2", "a3"]} onCommit={() => {}} />);
    await user.type(screen.getByRole("combobox"), "a");

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: "a1" })).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("option", { name: "a3" })).toHaveAttribute("aria-selected", "true");
  });

  it("Escape closes the suggestion list", async () => {
    const user = userEvent.setup();
    render(<Harness suggestions={["a1", "a2"]} onCommit={() => {}} />);
    const input = screen.getByRole("combobox");
    await user.type(input, "a");
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("Enter commits the highlighted suggestion when one is highlighted", async () => {
    const onCommit = vi.fn();
    const user = userEvent.setup();
    render(<Harness suggestions={["apple", "apricot"]} onCommit={onCommit} />);
    await user.type(screen.getByRole("combobox"), "ap");
    await user.keyboard("{ArrowDown}");

    await user.keyboard("{Enter}");

    expect(onCommit).toHaveBeenCalledWith("apple");
  });

  it("Enter commits the raw typed text when nothing is highlighted", async () => {
    const onCommit = vi.fn();
    const user = userEvent.setup();
    render(<Harness suggestions={["apple", "apricot"]} onCommit={onCommit} />);
    await user.type(screen.getByRole("combobox"), "banana");

    await user.keyboard("{Enter}");

    expect(onCommit).toHaveBeenCalledWith("banana");
  });

  it("mousedown-selecting a suggestion prevents the default focus shift, so no blur-triggered raw-text commit fires", async () => {
    const onCommit = vi.fn();
    const onBlur = vi.fn();
    const user = userEvent.setup();
    render(<Harness suggestions={["apple", "apricot"]} onCommit={onCommit} onBlur={onBlur} initialValue="ap" />);
    const input = screen.getByRole("combobox");
    await user.click(input);
    expect(input).toHaveFocus();

    await user.click(screen.getByRole("option", { name: "apple" }));

    expect(onCommit).toHaveBeenCalledWith("apple");
    expect(onBlur).not.toHaveBeenCalled();
    expect(input).toHaveFocus();
  });

  it("calls preventDefault on the option's mousedown event so the input's blur handler is suppressed", () => {
    const onCommit = vi.fn();
    render(<Harness suggestions={["apple"]} onCommit={onCommit} initialValue="ap" />);
    const option = screen.getByRole("option", { name: "apple" });

    const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, "preventDefault");
    fireEvent(option, event);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(onCommit).toHaveBeenCalledWith("apple");
  });
});
