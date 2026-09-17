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

  // Regression-closure proof for Task 5's known interim issue: ScoreEditor previously defaulted
  // to `isDark = true` internally, so callers (FileDetailPanel/ProjectDetailPanel) that pass no
  // theme prop at all were rendering dark-theme-locked empty-dot colors for light/profolder
  // users. ScoreEditor no longer has an isDark concept at all — this proves the empty dots use
  // token classes (which resolve per-theme via CSS at runtime), not a hardcoded literal, when
  // rendered exactly like those callers do: with no theme prop passed whatsoever.
  it("renders empty dots with token classes (bg-ink-faint), not a hardcoded dark-locked literal, with no theme prop passed", () => {
    render(<ScoreEditor score={2} onChange={() => {}} />);

    const emptyDot = screen.getByRole("radio", { name: "5 of 5" });
    expect(emptyDot.className).toContain("bg-ink-faint");
    expect(emptyDot.className).toContain("hover:bg-ink-muted");
    expect(emptyDot.className).not.toContain("bg-slate-700");
    expect(emptyDot.className).not.toContain("bg-slate-300");
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
