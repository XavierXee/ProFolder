import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FileRow, computeLocation } from "../FileRow.js";
import type { AudioFile } from "../../types.js";

function makeFile(overrides: Partial<AudioFile> = {}): AudioFile {
  return {
    id: "f1",
    path: "/music/Song/track.wav",
    relativePath: "Song/track.wav",
    filename: "track.wav",
    extension: ".wav",
    size: 1024,
    modifiedAt: "2026-01-15T10:30:00.000Z",
    containingFolder: "Song",
    status: "draft",
    tags: [],
    score: null,
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
    isRemoved: false,
    ...overrides,
  };
}

/** The ProFolder accent-bar span is `aria-hidden`, but so is ScoreBadge's unrelated dot indicator
 * (`w-2 h-2 rounded-full`, see ScoreBadge.tsx) — disambiguate by the accent bar's distinctive
 * `w-[3px]` width class rather than matching on `aria-hidden` alone. */
function getAccentBar(container: HTMLElement): HTMLElement | null {
  return Array.from(container.querySelectorAll<HTMLElement>('span[aria-hidden="true"]')).find((el) =>
    el.className.split(/\s+/).includes("w-[3px]")
  ) ?? null;
}

function renderRow(overrides: Partial<Parameters<typeof FileRow>[0]> = {}) {
  const props = {
    file: makeFile(),
    isDark: true,
    isSelected: false,
    isFlash: false,
    flashRef: null,
    onClick: () => {},
    checked: false,
    onToggleCheck: () => {},
    isPlayingThis: false,
    onPlayClick: () => {},
    ...overrides,
  };
  return render(
    <table>
      <tbody>
        <FileRow {...props} />
      </tbody>
    </table>
  );
}

describe("computeLocation", () => {
  it("shows a single-level containing folder", () => {
    expect(computeLocation("Song/track.wav")).toBe("Song");
  });

  it("joins nested folders with ' / '", () => {
    expect(computeLocation("Album/Song/take2/track.wav")).toBe("Album / Song / take2");
  });

  it("falls back to '(root)' for a root-level file (no containing folder)", () => {
    expect(computeLocation("track.wav")).toBe("(root)");
  });
});

describe("FileRow", () => {
  it("renders the filename, extension, and location derived from relativePath", () => {
    renderRow({ file: makeFile({ relativePath: "Album/Song/track.wav" }) });

    expect(screen.getByText("track.wav")).toBeInTheDocument();
    expect(screen.getByText(".wav")).toBeInTheDocument();
    expect(screen.getByText("Album / Song")).toBeInTheDocument();
  });

  it("shows the file's full path as a tooltip on the location text", () => {
    renderRow({
      file: makeFile({ relativePath: "Album/Song/track.wav", path: "/music/Album/Song/track.wav" }),
    });

    expect(screen.getByText("Album / Song")).toHaveAttribute("title", "/music/Album/Song/track.wav");
  });

  it("shows '(root)' as the location for a root-level file", () => {
    renderRow({ file: makeFile({ relativePath: "track.wav" }) });

    expect(screen.getByText("(root)")).toBeInTheDocument();
  });

  it("renders an em-dash when the file has no tags", () => {
    renderRow({ file: makeFile({ tags: [] }) });

    // The tags cell and the project cell can both render "—"; scope to all matches.
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("renders each tag as a chip when tags are present", () => {
    renderRow({ file: makeFile({ tags: ["rock", "jazz"] }) });

    expect(screen.getByText("rock")).toBeInTheDocument();
    expect(screen.getByText("jazz")).toBeInTheDocument();
  });

  it("renders the projectId when set", () => {
    renderRow({ file: makeFile({ projectId: "proj-42" }) });

    expect(screen.getByText("proj-42")).toBeInTheDocument();
  });

  it("renders '—' as the projectId fallback when unset", () => {
    const { container } = renderRow({ file: makeFile({ projectId: undefined, tags: [] }) });

    // Both the tags cell and the project cell render "—" in this case.
    expect(container.querySelectorAll("td")[3].textContent).toBe("—");
    expect(container.querySelectorAll("td")[4].textContent).toBe("—");
  });

  it("shows a 'Play <filename>' label and play icon when not currently playing this file", () => {
    renderRow({ file: makeFile({ filename: "beat.wav" }), isPlayingThis: false });

    expect(screen.getByRole("button", { name: "Play beat.wav" })).toBeInTheDocument();
  });

  it("shows a 'Pause <filename>' label when this file is currently playing", () => {
    renderRow({ file: makeFile({ filename: "beat.wav" }), isPlayingThis: true });

    expect(screen.getByRole("button", { name: "Pause beat.wav" })).toBeInTheDocument();
  });

  it("calls onPlayClick when the play button is clicked", async () => {
    const onPlayClick = vi.fn();
    const user = userEvent.setup();
    renderRow({ file: makeFile({ filename: "beat.wav" }), onPlayClick });

    await user.click(screen.getByRole("button", { name: "Play beat.wav" }));

    expect(onPlayClick).toHaveBeenCalledTimes(1);
  });

  it("stops the play button click from propagating to the row's onClick", async () => {
    const onPlayClick = vi.fn();
    const onClick = vi.fn();
    const user = userEvent.setup();
    renderRow({ file: makeFile({ filename: "beat.wav" }), onPlayClick, onClick });

    await user.click(screen.getByRole("button", { name: "Play beat.wav" }));

    expect(onPlayClick).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("calls onClick when the row itself is clicked", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    renderRow({ onClick });

    await user.click(screen.getByText("track.wav"));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("reflects isSelected via aria-selected on the row", () => {
    const { container } = renderRow({ isSelected: true });

    expect(container.querySelector("tr")).toHaveAttribute("aria-selected", "true");
  });

  it("passes checked/onToggleCheck through to the row's checkbox", async () => {
    const onToggleCheck = vi.fn();
    const user = userEvent.setup();
    renderRow({ file: makeFile({ filename: "beat.wav" }), checked: false, onToggleCheck });

    const checkbox = screen.getByLabelText("Select beat.wav");
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);

    expect(onToggleCheck).toHaveBeenCalledTimes(1);
  });

  it("stops the checkbox click from propagating to the row's onClick", async () => {
    const onToggleCheck = vi.fn();
    const onClick = vi.fn();
    const user = userEvent.setup();
    renderRow({ file: makeFile({ filename: "beat.wav" }), onToggleCheck, onClick });

    const checkbox = screen.getByLabelText("Select beat.wav");
    await user.click(checkbox);

    expect(onToggleCheck).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("centers the checkbox cell to match the header's centered alignment", () => {
    renderRow({ file: makeFile({ filename: "beat.wav" }) });

    const cell = screen.getByLabelText("Select beat.wav").closest("td");
    expect(cell).toHaveClass("text-center");
  });

  it("renders tag chips with the --rt-radius token class instead of a bare `rounded` class", () => {
    renderRow({ file: makeFile({ tags: ["rock"] }) });

    const chip = screen.getByText("rock");
    expect(chip.className).toContain("rounded-[var(--rt-radius)]");
    expect(chip.className).not.toMatch(/(^|\s)rounded(\s|$)/);
  });

  it("leaves the play button's rounded-full class untouched (shape primitive, not a corner-radius token)", () => {
    renderRow({ file: makeFile({ filename: "beat.wav" }), isPlayingThis: false });

    const playButton = screen.getByRole("button", { name: "Play beat.wav" });
    expect(playButton.className).toContain("rounded-full");
    expect(playButton.className).not.toContain("rounded-[var(--rt-radius)]");
  });
});

describe("FileRow - ProFolder theme", () => {
  it("selected row: uses bg-surface-selected, a bg-chrome accent bar, and font-semibold on the name", () => {
    const { container } = renderRow({ isProFolder: true, isSelected: true, file: makeFile({ filename: "beat.wav" }) });

    const row = container.querySelector("tr");
    expect(row).toHaveClass("bg-surface-selected");
    expect(row).not.toHaveClass("bg-surface");

    const name = screen.getByText("beat.wav");
    expect(name).toHaveClass("font-semibold");
    expect(name).not.toHaveClass("font-medium");

    const accentBar = getAccentBar(container);
    expect(accentBar).not.toBeNull();
    expect(accentBar).toHaveClass("bg-chrome");
    expect(accentBar).not.toHaveClass("bg-border");
  });

  it("unselected row: uses bg-surface, a bg-border accent bar, and font-medium on the name", () => {
    const { container } = renderRow({ isProFolder: true, isSelected: false, file: makeFile({ filename: "beat.wav" }) });

    const row = container.querySelector("tr");
    expect(row).toHaveClass("bg-surface");
    expect(row).not.toHaveClass("bg-surface-selected");

    const name = screen.getByText("beat.wav");
    expect(name).toHaveClass("font-medium");
    expect(name).not.toHaveClass("font-semibold");

    const accentBar = getAccentBar(container);
    expect(accentBar).not.toBeNull();
    expect(accentBar).toHaveClass("bg-border");
    expect(accentBar).not.toHaveClass("bg-chrome");
  });

  it("does not render an accent bar element when isProFolder is false", () => {
    const { container } = renderRow({ isProFolder: false, isSelected: true });

    expect(getAccentBar(container)).toBeNull();
  });

  it("renders tag chips with the display-chip treatment (bg-surface/border-border/text-ink-muted)", () => {
    renderRow({ isProFolder: true, file: makeFile({ tags: ["rock"] }) });

    const chip = screen.getByText("rock");
    expect(chip).toHaveClass("bg-surface");
    expect(chip).toHaveClass("border-border");
    expect(chip).toHaveClass("text-ink-muted");
    expect(chip).not.toHaveClass("bg-chrome");
  });

  it("applies the same display-chip tag treatment regardless of whether the row is selected", () => {
    renderRow({ isProFolder: true, isSelected: true, file: makeFile({ tags: ["rock"] }) });

    const chip = screen.getByText("rock");
    expect(chip).toHaveClass("bg-surface");
    expect(chip).toHaveClass("border-border");
    expect(chip).toHaveClass("text-ink-muted");
  });

  it("uses bg-chrome only on the selected-row accent bar, nowhere else in the row", () => {
    const { container } = renderRow({
      isProFolder: true,
      isSelected: true,
      file: makeFile({ tags: ["rock"], projectId: "proj-1" }),
    });

    const chromeEls = Array.from(container.querySelectorAll<HTMLElement>("*")).filter((el) => el.classList.contains("bg-chrome"));
    expect(chromeEls).toHaveLength(1);
    expect(chromeEls[0]).toHaveAttribute("aria-hidden", "true");
  });
});

describe("FileRow - Light/Dark regression guard (isProFolder omitted)", () => {
  it("selected row still uses the pre-existing blue-highlight classes for dark theme, with no ProFolder tokens", () => {
    const { container } = renderRow({ isDark: true, isSelected: true, file: makeFile({ filename: "beat.wav" }) });

    const row = container.querySelector("tr");
    expect(row).toHaveClass("bg-blue-500/8");
    expect(row).not.toHaveClass("bg-surface-selected");

    const name = screen.getByText("beat.wav");
    expect(name).toHaveClass("font-medium");
    expect(name).not.toHaveClass("font-semibold");

    expect(getAccentBar(container)).toBeNull();
  });

  it("selected row still uses the pre-existing blue-highlight classes for light theme, with no ProFolder tokens", () => {
    const { container } = renderRow({ isDark: false, isSelected: true, file: makeFile({ filename: "beat.wav" }) });

    const row = container.querySelector("tr");
    expect(row).toHaveClass("bg-blue-50");
    expect(row).not.toHaveClass("bg-surface-selected");
  });

  it("unselected row tag chips still use the pre-existing dark-theme classes", () => {
    renderRow({ isDark: true, file: makeFile({ tags: ["rock"] }) });

    const chip = screen.getByText("rock");
    expect(chip).toHaveClass("bg-white/5");
    expect(chip).toHaveClass("text-slate-400");
    expect(chip).not.toHaveClass("bg-surface");
  });

  it("unselected row tag chips still use the pre-existing light-theme classes", () => {
    renderRow({ isDark: false, file: makeFile({ tags: ["rock"] }) });

    const chip = screen.getByText("rock");
    expect(chip).toHaveClass("bg-slate-100");
    expect(chip).toHaveClass("text-slate-600");
    expect(chip).not.toHaveClass("bg-surface");
  });
});
