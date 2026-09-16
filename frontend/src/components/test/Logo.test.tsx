import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Logo from "../Logo.js";

describe("Logo", () => {
  it("renders without crashing", () => {
    render(<Logo />);
    expect(screen.getByTestId("logo")).toBeInTheDocument();
  });

  it("renders exactly 3 slab elements", () => {
    render(<Logo />);
    const slabs = screen.getAllByTestId("logo-slab");
    expect(slabs).toHaveLength(3);
  });

  it("colors the top slab solid yellow, middle slab with the yellow-to-blue gradient, and bottom slab solid blue", () => {
    render(<Logo />);
    const [top, middle, bottom] = screen.getAllByTestId("logo-slab");

    expect(top.style.background).toBe("rgb(250, 223, 130)");
    expect(middle.style.background).toContain("linear-gradient");
    expect(middle.style.background).toContain("#FADF82");
    expect(middle.style.background).toContain("#D5F7FE");
    expect(bottom.style.background).toBe("rgb(213, 247, 254)");
  });

  it("scales the container dimensions according to the size prop", () => {
    const { rerender } = render(<Logo size={16} />);
    const small = screen.getByTestId("logo");
    expect(small.style.width).toBe("16px");
    expect(small.style.height).toBe("16px");

    rerender(<Logo size={64} />);
    const large = screen.getByTestId("logo");
    expect(large.style.width).toBe("64px");
    expect(large.style.height).toBe("64px");
  });

  it("is treated as decorative via aria-hidden since it is always paired with adjacent text", () => {
    render(<Logo />);
    const logo = screen.getByTestId("logo");
    expect(logo).toHaveAttribute("aria-hidden", "true");
  });

  it("defaults to aria-hidden (no ariaLabel prop passed), matching the header's existing Task 4 usage unaffected by this change", () => {
    render(<Logo size={28} />);
    const logo = screen.getByTestId("logo");
    expect(logo).toHaveAttribute("aria-hidden", "true");
    expect(logo).not.toHaveAttribute("aria-label");
  });

  it("renders aria-label instead of aria-hidden when ariaLabel is provided, for usages with no adjacent identifying text (e.g. the splash screen)", () => {
    render(<Logo ariaLabel="ProFolder" />);
    const logo = screen.getByTestId("logo");
    expect(logo).toHaveAttribute("aria-label", "ProFolder");
    expect(logo).not.toHaveAttribute("aria-hidden");
  });

  it("positions each slab with the spec's percentage-based geometry and shear clip-path", () => {
    render(<Logo />);
    const [top, middle, bottom] = screen.getAllByTestId("logo-slab");
    const expectedTops = ["25%", "43.75%", "62.5%"];
    const expectedClipPath = "polygon(14% 0, 100% 0, 86% 100%, 0 100%)";

    for (const [slab, expectedTop] of [
      [top, expectedTops[0]],
      [middle, expectedTops[1]],
      [bottom, expectedTops[2]],
    ] as const) {
      expect(slab.style.left).toBe("18.75%");
      expect(slab.style.width).toBe("62.5%");
      expect(slab.style.height).toBe("12.5%");
      expect(slab.style.top).toBe(expectedTop);
      expect(slab.style.clipPath).toBe(expectedClipPath);
    }
  });
});
