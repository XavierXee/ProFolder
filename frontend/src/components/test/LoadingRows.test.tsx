import { describe, expect, it } from "vitest";
import { render, within } from "@testing-library/react";
import LoadingRows from "../LoadingRows.js";

describe("LoadingRows", () => {
  it("renders properly as 8 skeleton table rows, each with 8 cells", () => {
    const { container } = render(
      <table>
        <tbody>
          <LoadingRows />
        </tbody>
      </table>
    );

    const rows = container.querySelectorAll("tr");
    expect(rows).toHaveLength(8);

    rows.forEach((row) => {
      const cells = within(row as HTMLElement).getAllByRole("cell");
      expect(cells).toHaveLength(8);
      cells.forEach((cell) => {
        expect(cell.querySelector(".skeleton")).not.toBeNull();
      });
    });
  });

  it("skeleton bars use the --rt-radius token class instead of a bare `rounded` class", () => {
    const { container } = render(
      <table>
        <tbody>
          <LoadingRows />
        </tbody>
      </table>
    );

    const skeletons = container.querySelectorAll(".skeleton");
    expect(skeletons.length).toBeGreaterThan(0);
    skeletons.forEach((el) => {
      expect(el.className).toContain("rounded-[var(--rt-radius)]");
      expect(el.className).not.toMatch(/(^|\s)rounded(\s|$)/);
    });
  });
});
