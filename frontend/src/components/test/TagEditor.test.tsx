import { describe, expect, it } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TagEditor, computeAddTag } from "../TagEditor.js";

function Harness({ initialTags = [], allTags = [] }: { initialTags?: string[]; allTags?: string[] }) {
  const [tags, setTags] = useState<string[]>(initialTags);
  return <TagEditor tags={tags} onChange={setTags} allTags={allTags} />;
}

describe("computeAddTag", () => {
  it("trims leading/trailing whitespace from the added tag", () => {
    expect(computeAddTag([], "  rock  ")).toEqual(["rock"]);
  });

  it("rejects (no-op, same reference returned) an empty string", () => {
    const tags = ["a"];
    expect(computeAddTag(tags, "")).toBe(tags);
  });

  it("rejects (no-op, same reference returned) a whitespace-only string", () => {
    const tags = ["a"];
    expect(computeAddTag(tags, "   ")).toBe(tags);
  });

  it("rejects (no-op, same reference returned) a tag that already exists", () => {
    const tags = ["rock", "jazz"];
    expect(computeAddTag(tags, "rock")).toBe(tags);
  });

  it("rejects a duplicate even when the input has surrounding whitespace", () => {
    const tags = ["rock"];
    expect(computeAddTag(tags, "  rock  ")).toBe(tags);
  });

  it("appends a new, non-duplicate tag", () => {
    expect(computeAddTag(["rock"], "jazz")).toEqual(["rock", "jazz"]);
  });
});

describe("TagEditor", () => {
  it("renders properly, showing existing tags as chips plus the input", () => {
    render(<Harness initialTags={["rock", "jazz"]} />);

    expect(screen.getByText("rock")).toBeInTheDocument();
    expect(screen.getByText("jazz")).toBeInTheDocument();
    expect(screen.getByLabelText("Remove tag rock")).toBeInTheDocument();
    expect(screen.getByLabelText("Remove tag jazz")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  // Regression-closure proof for Task 5's known interim issue: TagEditor previously defaulted
  // to `isDark = true` internally, so callers (FileDetailPanel/ProjectDetailPanel) that pass no
  // theme prop at all were rendering dark-theme-locked chip colors for light/profolder users.
  // TagEditor no longer has an isDark concept at all — this proves it renders token classes
  // (which resolve per-theme via CSS at runtime) rather than any hardcoded literal, when
  // rendered exactly like those callers do: with no theme prop passed whatsoever.
  it("renders chips with token classes (bg-chip-surface/text-ink-secondary), not a hardcoded dark-locked literal, with no theme prop passed", () => {
    render(<Harness initialTags={["rock"]} />);

    const chip = screen.getByText("rock");
    expect(chip.className).toContain("bg-chip-surface");
    expect(chip.className).toContain("text-ink-secondary");
    expect(chip.className).not.toContain("bg-white/8");
    expect(chip.className).not.toContain("bg-slate-100");

    const removeBtn = screen.getByLabelText("Remove tag rock");
    expect(removeBtn.className).toContain("text-ink-muted");
    expect(removeBtn.className).not.toContain("text-slate-500");
    expect(removeBtn.className).not.toContain("text-slate-400");
  });

  it("renders with no chips when there are no tags", () => {
    render(<Harness initialTags={[]} />);

    expect(screen.queryByLabelText(/Remove tag/)).not.toBeInTheDocument();
  });

  it("adds a new tag, trimmed, and clears the input on Enter", async () => {
    const user = userEvent.setup();
    render(<Harness initialTags={[]} />);
    const input = screen.getByRole("combobox");

    await user.type(input, "  jazz  ");
    await user.keyboard("{Enter}");

    expect(screen.getByText("jazz")).toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  it("adds a new tag, trimmed, and clears the input on blur", async () => {
    const user = userEvent.setup();
    render(<Harness initialTags={[]} />);
    const input = screen.getByRole("combobox");

    await user.type(input, "  jazz  ");
    fireEvent.blur(input);

    expect(screen.getByText("jazz")).toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  it("does not add a duplicate tag", async () => {
    const user = userEvent.setup();
    render(<Harness initialTags={["rock"]} />);
    const input = screen.getByRole("combobox");

    await user.type(input, "rock");
    await user.keyboard("{Enter}");

    expect(screen.getAllByText("rock")).toHaveLength(1);
    expect(input).toHaveValue("");
  });

  it("does not add an empty/whitespace-only tag", async () => {
    const user = userEvent.setup();
    render(<Harness initialTags={[]} />);
    const input = screen.getByRole("combobox");

    await user.type(input, "   ");
    await user.keyboard("{Enter}");

    expect(screen.queryByLabelText(/Remove tag/)).not.toBeInTheDocument();
  });

  it("removes a tag when its remove button is clicked", async () => {
    const user = userEvent.setup();
    render(<Harness initialTags={["rock", "jazz"]} />);

    await user.click(screen.getByLabelText("Remove tag rock"));

    expect(screen.queryByText("rock")).not.toBeInTheDocument();
    expect(screen.getByText("jazz")).toBeInTheDocument();
  });

  it("excludes tags already applied to the item from the suggestion list", async () => {
    const user = userEvent.setup();
    render(<Harness initialTags={["rock"]} allTags={["rock", "jazz", "pop"]} />);

    // "o" matches "rock" and "pop" but not "jazz"; "rock" must be excluded
    // because it's already applied, leaving only "pop".
    await user.type(screen.getByRole("combobox"), "o");

    expect(screen.getByRole("option", { name: "pop" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "rock" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "jazz" })).not.toBeInTheDocument();
  });
});
