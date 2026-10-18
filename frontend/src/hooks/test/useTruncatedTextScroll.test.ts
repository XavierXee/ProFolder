import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { fireEvent } from "@testing-library/dom";
import { HOVER_DELAY_MS, MOVE_TOLERANCE_PX, SCROLL_SPEED_PX_PER_S, useTruncatedTextScroll } from "../useTruncatedTextScroll.js";

/** jsdom doesn't do layout, so scroll geometry is faked per element. */
function makeTruncated({ scrollWidth = 300, clientWidth = 100, ellipsis = true } = {}) {
  const el = document.createElement("div");
  if (ellipsis) {
    el.style.textOverflow = "ellipsis";
    el.style.overflow = "hidden";
    el.style.whiteSpace = "nowrap";
  }
  const child = document.createElement("span");
  child.textContent = "A very long filename that does not fit.wav";
  el.appendChild(child);
  let scrollLeft = 0;
  Object.defineProperty(el, "scrollWidth", { configurable: true, get: () => scrollWidth });
  Object.defineProperty(el, "clientWidth", { configurable: true, get: () => clientWidth });
  Object.defineProperty(el, "scrollLeft", {
    configurable: true,
    get: () => scrollLeft,
    set: (v: number) => { scrollLeft = v; },
  });
  document.body.appendChild(el);
  return { el, child };
}

describe("useTruncatedTextScroll", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"],
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("does not scroll before the cursor has rested for the hover delay", () => {
    renderHook(() => useTruncatedTextScroll());
    const { el, child } = makeTruncated();
    fireEvent.mouseOver(child, { clientX: 10, clientY: 10 });
    vi.advanceTimersByTime(HOVER_DELAY_MS - 50);
    expect(el.scrollLeft).toBe(0);
    expect(el.style.textOverflow).toBe("ellipsis");
  });

  it("scrolls left to right at the configured speed after the delay, clipping the ellipsis", () => {
    renderHook(() => useTruncatedTextScroll());
    const { el, child } = makeTruncated();
    fireEvent.mouseOver(child, { clientX: 10, clientY: 10 });
    vi.advanceTimersByTime(HOVER_DELAY_MS);
    expect(el.style.textOverflow).toBe("clip");
    vi.advanceTimersByTime(1000);
    // ~1s of scrolling (minus the first frame used as the time baseline).
    expect(el.scrollLeft).toBeGreaterThan(SCROLL_SPEED_PX_PER_S * 0.9);
    expect(el.scrollLeft).toBeLessThanOrEqual(SCROLL_SPEED_PX_PER_S);
  });

  it("stops at the end of the text", () => {
    renderHook(() => useTruncatedTextScroll());
    const { el, child } = makeTruncated({ scrollWidth: 300, clientWidth: 100 });
    fireEvent.mouseOver(child, { clientX: 10, clientY: 10 });
    vi.advanceTimersByTime(HOVER_DELAY_MS + 60_000);
    expect(el.scrollLeft).toBe(200);
  });

  it("restarts the delay when the cursor moves before scrolling starts", () => {
    renderHook(() => useTruncatedTextScroll());
    const { el, child } = makeTruncated();
    fireEvent.mouseOver(child, { clientX: 10, clientY: 10 });
    vi.advanceTimersByTime(HOVER_DELAY_MS - 100);
    fireEvent.mouseMove(child, { clientX: 10 + MOVE_TOLERANCE_PX + 1, clientY: 10 });
    vi.advanceTimersByTime(500);
    expect(el.style.textOverflow).toBe("ellipsis");
    vi.advanceTimersByTime(HOVER_DELAY_MS);
    expect(el.style.textOverflow).toBe("clip");
  });

  it("ignores jitter within the movement tolerance", () => {
    renderHook(() => useTruncatedTextScroll());
    const { el, child } = makeTruncated();
    fireEvent.mouseOver(child, { clientX: 10, clientY: 10 });
    vi.advanceTimersByTime(HOVER_DELAY_MS - 100);
    fireEvent.mouseMove(child, { clientX: 10 + MOVE_TOLERANCE_PX, clientY: 10 });
    vi.advanceTimersByTime(100);
    expect(el.style.textOverflow).toBe("clip");
  });

  it("resets scroll and restores the ellipsis when the cursor moves to another element", () => {
    renderHook(() => useTruncatedTextScroll());
    const { el, child } = makeTruncated();
    const other = document.createElement("div");
    document.body.appendChild(other);
    fireEvent.mouseOver(child, { clientX: 10, clientY: 10 });
    vi.advanceTimersByTime(HOVER_DELAY_MS + 1000);
    expect(el.scrollLeft).toBeGreaterThan(0);
    fireEvent.mouseOver(other);
    expect(el.scrollLeft).toBe(0);
    expect(el.style.textOverflow).toBe("ellipsis");
  });

  it("keeps scrolling when the text slides out from under a still cursor onto the element itself", () => {
    renderHook(() => useTruncatedTextScroll());
    const { el, child } = makeTruncated();
    fireEvent.mouseOver(child, { clientX: 10, clientY: 10 });
    vi.advanceTimersByTime(HOVER_DELAY_MS + 1000);
    const scrolled = el.scrollLeft;
    expect(scrolled).toBeGreaterThan(0);
    // The browser re-targets mouseover as content moves under the cursor. By now the element's
    // own ellipsis has been swapped for "clip", so it must not stop being recognized.
    fireEvent.mouseOver(el, { clientX: 10, clientY: 10 });
    vi.advanceTimersByTime(500);
    expect(el.scrollLeft).toBeGreaterThan(scrolled);
  });

  it("resets when the cursor leaves the window", () => {
    renderHook(() => useTruncatedTextScroll());
    const { el, child } = makeTruncated();
    fireEvent.mouseOver(child, { clientX: 10, clientY: 10 });
    vi.advanceTimersByTime(HOVER_DELAY_MS + 1000);
    fireEvent.mouseOut(child, { relatedTarget: null });
    expect(el.scrollLeft).toBe(0);
    expect(el.style.textOverflow).toBe("ellipsis");
  });

  it("does nothing for ellipsis text that fits, or overflowing text without an ellipsis", () => {
    renderHook(() => useTruncatedTextScroll());
    const fits = makeTruncated({ scrollWidth: 100, clientWidth: 100 });
    const noEllipsis = makeTruncated({ ellipsis: false });
    fireEvent.mouseOver(fits.child, { clientX: 10, clientY: 10 });
    vi.advanceTimersByTime(HOVER_DELAY_MS + 1000);
    fireEvent.mouseOver(noEllipsis.child, { clientX: 10, clientY: 10 });
    vi.advanceTimersByTime(HOVER_DELAY_MS + 1000);
    expect(fits.el.scrollLeft).toBe(0);
    expect(noEllipsis.el.scrollLeft).toBe(0);
  });

  it("removes its listeners on unmount", () => {
    const { unmount } = renderHook(() => useTruncatedTextScroll());
    unmount();
    const { el, child } = makeTruncated();
    fireEvent.mouseOver(child, { clientX: 10, clientY: 10 });
    vi.advanceTimersByTime(HOVER_DELAY_MS + 1000);
    expect(el.scrollLeft).toBe(0);
  });
});
