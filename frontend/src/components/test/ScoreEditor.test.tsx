import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScoreEditor } from "../ScoreEditor.js";

describe("ScoreEditor", () => {
  it("renders properly with 5 radio dots and marks the current score as checked", () => {
    render(<ScoreEditor score={3} onChange={() => {}} />);

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(5);
    expect(screen.getByRole("radio", { name: "3 of 5" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "1 of 5" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("3/5")).toBeInTheDocument();
  });

  it("renders no checked dot and no score label when score is null", () => {
    render(<ScoreEditor score={null} onChange={() => {}} />);

    screen.getAllByRole("radio").forEach((radio) => {
      expect(radio).toHaveAttribute("aria-checked", "false");
    });
    expect(screen.queryByText(/\/5$/)).not.toBeInTheDocument();
  });

  it("calls onChange(null) when clicking the currently-active score (toggle off)", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ScoreEditor score={3} onChange={onChange} />);

    await user.click(screen.getByRole("radio", { name: "3 of 5" }));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("calls onChange(value) when clicking a different score", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ScoreEditor score={3} onChange={onChange} />);

    await user.click(screen.getByRole("radio", { name: "5 of 5" }));

    expect(onChange).toHaveBeenCalledWith(5);
  });

  it("disables all dots and prevents onChange from firing when disabled", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ScoreEditor score={3} onChange={onChange} disabled />);

    const radios = screen.getAllByRole("radio");
    radios.forEach((radio) => expect(radio).toBeDisabled());

    await user.click(screen.getByRole("radio", { name: "5 of 5" }));

    expect(onChange).not.toHaveBeenCalled();
  });
});
