import { useEffect } from "react";

/** How long the cursor has to rest on truncated text before it starts scrolling. */
export const HOVER_DELAY_MS = 1000;
/** Scroll speed once started — slow enough to read along. */
export const SCROLL_SPEED_PX_PER_S = 40;
/** Cursor movement (px) tolerated before the hover counts as "not static" and the delay restarts. */
export const MOVE_TOLERANCE_PX = 4;

/** Nearest ancestor-or-self of `target` that truncates its text with an ellipsis and is
 * currently overflowing (i.e. text is actually hidden), or null. */
function findTruncatedElement(target: EventTarget | null): HTMLElement | null {
  let el = target instanceof Element ? target : null;
  while (el && el !== document.body) {
    if (
      el instanceof HTMLElement &&
      getComputedStyle(el).textOverflow === "ellipsis" &&
      el.scrollWidth > el.clientWidth
    ) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

/** App-wide behavior: any element truncated with `text-overflow: ellipsis` (Tailwind's
 * `truncate`) slowly scrolls its hidden text into view, left to right, once the cursor has
 * rested on it for HOVER_DELAY_MS. Implemented as one set of delegated document listeners so
 * every current and future truncated label/title/dropdown item gets it without per-component
 * wiring. The element snaps back to its truncated state as soon as the cursor leaves it. */
export function useTruncatedTextScroll(): void {
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let active: HTMLElement | null = null;
    let savedTextOverflow = "";
    let timer: ReturnType<typeof setTimeout> | null = null;
    let frame: number | null = null;
    let anchorX = 0;
    let anchorY = 0;

    const stop = () => {
      if (timer !== null) clearTimeout(timer);
      if (frame !== null) cancelAnimationFrame(frame);
      timer = null;
      frame = null;
      if (active) {
        active.scrollLeft = 0;
        active.style.textOverflow = savedTextOverflow;
        active = null;
      }
    };

    const startScrolling = (el: HTMLElement) => {
      timer = null;
      if (!el.isConnected) return;
      savedTextOverflow = el.style.textOverflow;
      // Clip instead of ellipsis while scrolling, otherwise the "…" stays painted over the text.
      el.style.textOverflow = "clip";
      let last: number | null = null;
      let position = 0;
      const step = (now: number) => {
        if (active !== el || !el.isConnected) return;
        const max = el.scrollWidth - el.clientWidth;
        if (last !== null) position = Math.min(max, position + ((now - last) / 1000) * SCROLL_SPEED_PX_PER_S);
        last = now;
        el.scrollLeft = position;
        frame = position < max ? requestAnimationFrame(step) : null;
      };
      frame = requestAnimationFrame(step);
    };

    const arm = (el: HTMLElement, x: number, y: number) => {
      anchorX = x;
      anchorY = y;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => startScrolling(el), HOVER_DELAY_MS);
    };

    const onMouseOver = (e: MouseEvent) => {
      // Scrolling moves content under a still cursor, so mouseover re-fires on whatever is now
      // under it — including the element itself, whose ellipsis is swapped for "clip" mid-scroll
      // and so no longer matches findTruncatedElement. Anywhere inside it is still the same hover.
      if (active && e.target instanceof Node && active.contains(e.target)) return;
      const el = findTruncatedElement(e.target);
      if (el === active) return;
      stop();
      if (el) {
        active = el;
        arm(el, e.clientX, e.clientY);
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      // Only a still cursor triggers the scroll: moving before it starts restarts the delay.
      // Once scrolling has started it keeps going until the cursor leaves the element.
      if (!active || timer === null) return;
      if (Math.abs(e.clientX - anchorX) > MOVE_TOLERANCE_PX || Math.abs(e.clientY - anchorY) > MOVE_TOLERANCE_PX) {
        arm(active, e.clientX, e.clientY);
      }
    };

    const onMouseOut = (e: MouseEvent) => {
      // Leaving the window entirely (no element under the cursor next).
      if (e.relatedTarget === null) stop();
    };

    document.addEventListener("mouseover", onMouseOver);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseout", onMouseOut);
    return () => {
      document.removeEventListener("mouseover", onMouseOver);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseout", onMouseOut);
      stop();
    };
  }, []);
}
