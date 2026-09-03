import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ScoreBadge from "../ScoreBadge.js";
import { SCORE_DOT_COLORS } from "../../scoreStyles.js";

function getDots(container: HTMLElement) {
  return Array.from(container.querySelectorAll('span[aria-hidden="true"]'));
}

describe("ScoreBadge", () => {
  it("renders properly with a numeric score, exposing an aria-label and 5 dots", () => {
    const { container } = render(<ScoreBadge score={3} />);

    const badge = screen.getByLabelText("Score: 3 of 5");
    expect(badge).toBeInTheDocument();
    expect(getDots(container)).toHaveLength(5);
  });

  it("fills exactly N dots for a score of N out of 5", () => {
    const { container } = render(<ScoreBadge score={3} />);

    const dots = getDots(container);
    dots.forEach((dot, i) => {
      const value = i + 1;
      if (value <= 3) {
        expect(dot.className).toContain(SCORE_DOT_COLORS[value]);
      } else {
        expect(dot.className).toContain("bg-slate-700");
      }
    });
  });

  it("renders no filled dots and a 'not set' label when score is null", () => {
    const { container } = render(<ScoreBadge score={null} />);

    const badge = screen.getByLabelText("Score: not set");
    expect(badge).toBeInTheDocument();

    const dots = getDots(container);
    expect(dots).toHaveLength(5);
    dots.forEach((dot) => {
      expect(dot.className).toContain("bg-slate-700");
    });
  });

  it("uses the light empty-dot color when isDark is false", () => {
    const { container } = render(<ScoreBadge score={null} isDark={false} />);

    const dots = getDots(container);
    dots.forEach((dot) => {
      expect(dot.className).toContain("bg-slate-300");
    });
  });
});
