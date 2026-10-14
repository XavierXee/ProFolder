import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AudioPlayerBar, { formatTime } from "../AudioPlayerBar.js";
import type { AudioFile } from "../../types.js";

function makeFile(overrides: Partial<AudioFile> = {}): AudioFile {
  return {
    id: "file-1",
    path: "/music/Song.wav",
    relativePath: "Song.wav",
    filename: "Song.wav",
    extension: ".wav",
    size: 1000,
    modifiedAt: "2026-01-01T00:00:00.000Z",
    containingFolder: "/music",
    status: "unknown",
    tags: [],
    score: null,
    notes: "",
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
    isRemoved: false,
    ...overrides,
  };
}

function renderBar(overrides: Partial<Parameters<typeof AudioPlayerBar>[0]> = {}) {
  const props = {
    file: makeFile() as AudioFile | null,
    isPlaying: false,
    onPlayingChange: vi.fn(),
    onClose: () => {},
    ...overrides,
  };
  const result = render(<AudioPlayerBar {...props} />);
  const audio = result.container.querySelector("audio") as HTMLAudioElement | null;
  return { ...result, props, audio };
}

/** jsdom's HTMLMediaElement.duration is a getter-only accessor; a plain
 * assignment silently no-ops, so tests that need to simulate a loaded
 * duration must override it via defineProperty before firing loadedmetadata. */
function setAudioDuration(audio: HTMLAudioElement, seconds: number) {
  Object.defineProperty(audio, "duration", { value: seconds, configurable: true });
}

describe("formatTime", () => {
  it("formats a normal positive value as m:ss with zero-padded seconds", () => {
    expect(formatTime(75)).toBe("1:15");
    expect(formatTime(5)).toBe("0:05");
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(600)).toBe("10:00");
  });

  it("falls back to 0:00 for non-finite input (NaN, Infinity)", () => {
    expect(formatTime(NaN)).toBe("0:00");
    expect(formatTime(Infinity)).toBe("0:00");
    expect(formatTime(-Infinity)).toBe("0:00");
  });

  it("falls back to 0:00 for negative input instead of producing a negative display", () => {
    expect(formatTime(-5)).toBe("0:00");
  });
});

describe("AudioPlayerBar - absent file", () => {
  it("renders nothing when file is null", () => {
    const { container } = renderBar({ file: null });

    expect(container.firstChild).toBeNull();
  });
});

describe("AudioPlayerBar - token-driven styling (no isDark prop)", () => {
  it("renders with bg-surface/border-border on the bar and text-ink on the filename, with no hardcoded isDark literal", () => {
    const { container } = renderBar({ file: makeFile({ filename: "Track.wav" }) });

    const bar = container.firstChild as HTMLElement;
    expect(bar.className).toContain("bg-surface");
    expect(bar.className).toContain("border-border");
    expect(bar.className).not.toContain("bg-[#13161e]");
    expect(bar.className).not.toContain("bg-white");

    expect(screen.getByText("Track.wav").className).toContain("text-ink");

    expect(screen.getByLabelText("Close player").className).toContain("text-ink-muted");
    // Stop button: text-ink-secondary (not text-ink-muted) preserves this button's original,
    // higher-contrast idle color (byte-exact to the old text-slate-300 in dark; one step
    // higher-contrast than the old text-slate-600 in light) — using ink-muted here would be a
    // WCAG SC 1.4.11 contrast regression on the rendered icon (fill="currentColor").
    const stopBtn = screen.getByLabelText("Stop");
    expect(stopBtn.className).toContain("text-ink-secondary");
    expect(stopBtn.className).not.toContain("text-ink-muted");
  });
});

describe("AudioPlayerBar - basic rendering", () => {
  it("shows the filename and relative path", () => {
    renderBar({ file: makeFile({ filename: "Track One.wav", relativePath: "Album/Track One.wav" }) });

    expect(screen.getByText("Track One.wav")).toBeInTheDocument();
    expect(screen.getByText("Album/Track One.wav")).toBeInTheDocument();
  });

  it("shows a Play button when not playing, and toggles isPlaying on click", async () => {
    const onPlayingChange = vi.fn();
    const user = userEvent.setup();
    renderBar({ isPlaying: false, onPlayingChange });

    const playBtn = screen.getByRole("button", { name: "Play" });
    await user.click(playBtn);

    expect(onPlayingChange).toHaveBeenCalledWith(true);
  });

  it("shows a Pause button when playing", () => {
    renderBar({ isPlaying: true });

    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });
});

describe("AudioPlayerBar - handleSeek", () => {
  it("updates the displayed current time and the audio element's currentTime", () => {
    const { audio } = renderBar();
    // The range input's max mirrors duration (0 until loaded); load metadata
    // first so a seek to 42 isn't clamped down to jsdom's max=0 default.
    setAudioDuration(audio!, 120);
    fireEvent.loadedMetadata(audio!);
    const seekSlider = screen.getByRole("slider", { name: "Seek" });

    fireEvent.change(seekSlider, { target: { value: "42" } });

    expect(audio!.currentTime).toBe(42);
    expect(screen.getByText(formatTime(42))).toBeInTheDocument();
  });
});

describe("AudioPlayerBar - handleStop", () => {
  it("resets currentTime to 0, resets the displayed time, and reports playing=false", async () => {
    const onPlayingChange = vi.fn();
    const { audio } = renderBar({ isPlaying: true, onPlayingChange });
    setAudioDuration(audio!, 120);
    fireEvent.loadedMetadata(audio!);

    // Simulate playback having progressed.
    fireEvent.change(screen.getByRole("slider", { name: "Seek" }), { target: { value: "30" } });
    await waitFor(() => expect(screen.getByText(formatTime(30))).toBeInTheDocument());

    await userEvent.setup().click(screen.getByRole("button", { name: "Stop" }));

    expect(onPlayingChange).toHaveBeenCalledWith(false);
    expect(audio!.currentTime).toBe(0);
    expect(screen.getByText(formatTime(0))).toBeInTheDocument();
  });
});

describe("AudioPlayerBar - reset on file change", () => {
  it("resets the displayed current time and duration when switching to a different file", async () => {
    const { rerender, audio } = renderBar({ file: makeFile({ id: "file-1" }) });

    setAudioDuration(audio!, 200);
    fireEvent.loadedMetadata(audio!);
    fireEvent.change(screen.getByRole("slider", { name: "Seek" }), { target: { value: "90" } });

    await waitFor(() => expect(screen.getByText(formatTime(90))).toBeInTheDocument());
    expect(screen.getByText(formatTime(200))).toBeInTheDocument();

    rerender(
      <AudioPlayerBar
        file={makeFile({ id: "file-2", filename: "Other.wav" })}
        isPlaying={false}
        onPlayingChange={vi.fn()}
        onClose={() => {}}
      />
    );

    await waitFor(() => expect(screen.getByText("Other.wav")).toBeInTheDocument());
    // Two "0:00" labels: current time and duration, both reset for the new file.
    expect(screen.getAllByText(formatTime(0))).toHaveLength(2);
  });
});

describe("AudioPlayerBar - play rejection", () => {
  it("shows an error message and reports playing=false when play() rejects", async () => {
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValueOnce(new Error("NotAllowedError"));
    const onPlayingChange = vi.fn();

    renderBar({ isPlaying: true, onPlayingChange });

    await waitFor(() => expect(screen.getByText("Could not play this file")).toBeInTheDocument());
    expect(onPlayingChange).toHaveBeenCalledWith(false);

    playSpy.mockRestore();
  });
});
