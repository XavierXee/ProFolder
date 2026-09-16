import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import SplashScreen from "../SplashScreen.js";

describe("SplashScreen", () => {
  describe("timed visibility", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("renders immediately on mount: logo present, 'Syncing...' text present", () => {
      render(<SplashScreen />);
      expect(screen.getByTestId("logo")).toBeInTheDocument();
      expect(screen.getByText("Syncing...")).toBeInTheDocument();
    });

    it("does NOT hide before the 1000ms deadline", () => {
      render(<SplashScreen />);
      act(() => {
        vi.advanceTimersByTime(999);
      });
      expect(screen.getByTestId("logo")).toBeInTheDocument();
      expect(screen.getByText("Syncing...")).toBeInTheDocument();
    });

    it("hides/unmounts after exactly 1000ms", () => {
      render(<SplashScreen />);
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.queryByTestId("logo")).not.toBeInTheDocument();
      expect(screen.queryByText("Syncing...")).not.toBeInTheDocument();
    });
  });

  it("uses token classes (bg-canvas/text-ink) for the background/text, not hardcoded colors, so the splash is theme-aware", () => {
    render(<SplashScreen />);
    const overlay = screen.getByTestId("logo").parentElement;
    expect(overlay).not.toBeNull();
    expect(overlay!.className).toContain("bg-canvas");
    expect(overlay!.className).toContain("text-ink");
  });

  it("gives the logo a real accessible label (not aria-hidden), since no other visible text conveys the app identity here", () => {
    render(<SplashScreen />);
    const logo = screen.getByTestId("logo");
    expect(logo).toHaveAttribute("aria-label", "ProFolder");
    expect(logo).not.toHaveAttribute("aria-hidden");
  });
});
