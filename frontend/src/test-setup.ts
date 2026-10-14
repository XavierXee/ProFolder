import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

// jsdom doesn't implement HTMLMediaElement playback; AudioPlayerBar calls
// audio.play().catch(...), which throws without these stubs since jsdom's
// default play()/pause() return undefined instead of a Promise.
HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
HTMLMediaElement.prototype.pause = vi.fn();

// jsdom doesn't implement Element.scrollIntoView at all (calling it throws "not a function"),
// unlike play()/pause() above which exist but behave wrong — useArrowRowNavigation calls it to
// keep the selected row visible, which would otherwise crash every test that selects a row.
Element.prototype.scrollIntoView = vi.fn();
