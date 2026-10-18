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
    notes: "",
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

  it("keeps tags and status to one truncating line, so long values ellipsize instead of wrapping", () => {
    renderRow({ file: makeFile({ tags: ["rock", "ambient"], status: "unknown" }) });

    // One non-wrapping row; each chip truncates on its own so its border stays intact.
    const chips = screen.getByTestId("tag-chips");
    expect(chips).toHaveClass("flex");
    expect(chips).not.toHaveClass("flex-wrap");
    expect(screen.getByText("rock")).toHaveClass("truncate", "min-w-0");
    expect(screen.getByText("ambient")).toHaveClass("truncate", "min-w-0");
    expect(screen.getByLabelText("Status: Unknown")).toHaveClass("truncate", "max-w-full");
  });

  it("leaves the play button's rounded-full class untouched (shape primitive, not a corner-radius token)", () => {
    renderRow({ file: makeFile({ filename: "beat.wav" }), isPlayingThis: false });

    const playButton = screen.getByRole("button", { name: "Play beat.wav" });
    expect(playButton.className).toContain("rounded-full");
    expect(playButton.className).not.toContain("rounded-[var(--rt-radius)]");
  });
});

describe("FileRow - token-driven styling (no isDark/isProFolder props)", () => {
  it("selected row: uses the bg-surface-selected token, border-border, and font-semibold (via the profolder: variant) on the name", () => {
    const { container } = renderRow({ isSelected: true, file: makeFile({ filename: "beat.wav" }) });

    const row = container.querySelector("tr");
    expect(row).toHaveClass("bg-surface-selected");
    expect(row).toHaveClass("border-border");
    expect(row).not.toHaveClass("bg-surface");

    const name = screen.getByText("beat.wav");
    expect(name).toHaveClass("font-medium");
    expect(name).toHaveClass("profolder:font-semibold");
  });

  it("unselected row: uses the bg-surface/hover:bg-surface-hover tokens, border-border, and plain font-medium (no profolder: variant) on the name", () => {
    const { container } = renderRow({ isSelected: false, file: makeFile({ filename: "beat.wav" }) });

    const row = container.querySelector("tr");
    expect(row).toHaveClass("bg-surface");
    expect(row).toHaveClass("hover:bg-surface-hover");
    expect(row).toHaveClass("border-border");
    expect(row).not.toHaveClass("bg-surface-selected");

    const name = screen.getByText("beat.wav");
    expect(name).toHaveClass("font-medium");
    expect(name).not.toHaveClass("profolder:font-semibold");
  });

  it("renders tag chips with the display-chip treatment (bg-surface/border-border/text-ink-muted)", () => {
    renderRow({ file: makeFile({ tags: ["rock"] }) });

    const chip = screen.getByText("rock");
    expect(chip).toHaveClass("bg-surface");
    expect(chip).toHaveClass("border-border");
    expect(chip).toHaveClass("text-ink-muted");
    expect(chip).not.toHaveClass("bg-chrome");
  });

  it("applies the same display-chip tag treatment regardless of whether the row is selected", () => {
    renderRow({ isSelected: true, file: makeFile({ tags: ["rock"] }) });

    const chip = screen.getByText("rock");
    expect(chip).toHaveClass("bg-surface");
    expect(chip).toHaveClass("border-border");
    expect(chip).toHaveClass("text-ink-muted");
  });

  it("gives the filename text-ink and the empty-tags placeholder text-ink-faint", () => {
    // projectId is set so only the tags cell (not also the project cell) renders "—",
    // keeping this assertion unambiguous — the project cell's own "—" fallback uses
    // text-ink-muted, a distinct (less dim) token from the tags cell's text-ink-faint.
    const { container } = renderRow({ file: makeFile({ filename: "beat.wav", tags: [], projectId: "proj-1" }) });

    expect(screen.getByText("beat.wav")).toHaveClass("text-ink");
    const tagsCell = container.querySelectorAll("td")[3];
    expect(tagsCell.textContent).toBe("—");
    expect(tagsCell.querySelector("span")).toHaveClass("text-ink-faint");
  });

  it("colors the playing-state play button with bg-accent/text-accent-ink, and the idle button with text-ink-muted", () => {
    const { rerender } = renderRow({ file: makeFile({ filename: "beat.wav" }), isPlayingThis: false });

    expect(screen.getByRole("button", { name: "Play beat.wav" })).toHaveClass("text-ink-muted");

    rerender(
      <table>
        <tbody>
          <FileRow
            file={makeFile({ filename: "beat.wav" })}
            isSelected={false}
            isFlash={false}
            flashRef={null}
            onClick={() => {}}
            checked={false}
            onToggleCheck={() => {}}
            isPlayingThis={true}
            onPlayClick={() => {}}
          />
        </tbody>
      </table>
    );

    const playingButton = screen.getByRole("button", { name: "Pause beat.wav" });
    expect(playingButton).toHaveClass("bg-accent");
    expect(playingButton).toHaveClass("text-accent-ink");
  });
});
