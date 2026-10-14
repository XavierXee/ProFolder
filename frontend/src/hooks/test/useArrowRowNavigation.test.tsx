import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { useArrowRowNavigation } from "../useArrowRowNavigation.js";

type Item = { id: string };

const ITEMS: Item[] = [{ id: "a" }, { id: "b" }, { id: "c" }];

function Harness({
  active = true,
  items = ITEMS,
  initialSelectedId = "b",
  onSelectSpy,
}: {
  active?: boolean;
  items?: Item[];
  initialSelectedId?: string | null;
  onSelectSpy?: (id: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  function onSelect(id: string) {
    setSelectedId(id);
    onSelectSpy?.(id);
  }
  useArrowRowNavigation({ active, items, selectedId, onSelect });
  return (
    <div>
      <p data-testid="selected">{selectedId ?? "none"}</p>
      <input data-testid="text-input" />
      <textarea data-testid="textarea" />
      <button data-testid="plain-button">Plain button</button>
      <table>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} data-testid={`row-${item.id}`} aria-selected={item.id === selectedId}>
              <td>{item.id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function pressArrowDown(target: Element = document.body) {
  fireEvent.keyDown(target, { key: "ArrowDown" });
}

function pressArrowUp(target: Element = document.body) {
  fireEvent.keyDown(target, { key: "ArrowUp" });
}

describe("useArrowRowNavigation", () => {
  it("moves to the next item on ArrowDown", () => {
    render(<Harness initialSelectedId="b" />);
    pressArrowDown();
    expect(screen.getByTestId("selected")).toHaveTextContent("c");
  });

  it("moves to the previous item on ArrowUp", () => {
    render(<Harness initialSelectedId="b" />);
    pressArrowUp();
    expect(screen.getByTestId("selected")).toHaveTextContent("a");
  });

  it("clamps at the last item — ArrowDown on the last row is a no-op", () => {
    render(<Harness initialSelectedId="c" />);
    pressArrowDown();
    expect(screen.getByTestId("selected")).toHaveTextContent("c");
  });

  it("clamps at the first item — ArrowUp on the first row is a no-op", () => {
    render(<Harness initialSelectedId="a" />);
    pressArrowUp();
    expect(screen.getByTestId("selected")).toHaveTextContent("a");
  });

  it("does nothing when nothing is selected", () => {
    const onSelectSpy = vi.fn();
    render(<Harness initialSelectedId={null} onSelectSpy={onSelectSpy} />);
    pressArrowDown();
    expect(onSelectSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId("selected")).toHaveTextContent("none");
  });

  it("does nothing when inactive (not the currently-visible tab/panel)", () => {
    const onSelectSpy = vi.fn();
    render(<Harness active={false} initialSelectedId="b" onSelectSpy={onSelectSpy} />);
    pressArrowDown();
    expect(onSelectSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId("selected")).toHaveTextContent("b");
  });

  it("does nothing while focus is in a text input, so the input keeps native cursor-movement behavior", () => {
    render(<Harness initialSelectedId="b" />);
    const input = screen.getByTestId("text-input");
    input.focus();
    pressArrowDown(input);
    expect(screen.getByTestId("selected")).toHaveTextContent("b");
  });

  it("does nothing while focus is in a textarea, so the Notes field keeps native cursor-movement behavior", () => {
    render(<Harness initialSelectedId="b" />);
    const textarea = screen.getByTestId("textarea");
    textarea.focus();
    pressArrowDown(textarea);
    expect(screen.getByTestId("selected")).toHaveTextContent("b");
  });

  it("still navigates when focus is on a plain button (e.g. the detail panel's close button)", () => {
    render(<Harness initialSelectedId="b" />);
    const button = screen.getByTestId("plain-button");
    button.focus();
    pressArrowDown(button);
    expect(screen.getByTestId("selected")).toHaveTextContent("c");
  });

  it("ignores ArrowDown/ArrowUp combined with a modifier key", () => {
    render(<Harness initialSelectedId="b" />);
    fireEvent.keyDown(document.body, { key: "ArrowDown", metaKey: true });
    fireEvent.keyDown(document.body, { key: "ArrowDown", shiftKey: true });
    fireEvent.keyDown(document.body, { key: "ArrowDown", ctrlKey: true });
    fireEvent.keyDown(document.body, { key: "ArrowDown", altKey: true });
    expect(screen.getByTestId("selected")).toHaveTextContent("b");
  });

  it("ignores a selectedId that no longer exists in items", () => {
    const onSelectSpy = vi.fn();
    render(<Harness items={ITEMS} initialSelectedId="not-a-real-id" onSelectSpy={onSelectSpy} />);
    pressArrowDown();
    expect(onSelectSpy).not.toHaveBeenCalled();
  });

  it("removes its window keydown listener on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<Harness initialSelectedId="b" />);
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
    removeSpy.mockRestore();
  });
});

// scrollIntoView is stubbed on Element.prototype itself (see test-setup.ts, jsdom doesn't
// implement it at all), so every element shares the same mock function by default — each test
// below assigns a fresh vi.fn() as an own property on the specific row under test, shadowing
// the shared prototype stub, so the assertion can't be satisfied by some OTHER row's call.
describe("useArrowRowNavigation - keeps the selected row scrolled into view", () => {
  it("scrolls the newly-selected row into view after an ArrowDown move", () => {
    render(<Harness initialSelectedId="b" />);
    const rowC = screen.getByTestId("row-c");
    rowC.scrollIntoView = vi.fn();

    pressArrowDown();

    expect(rowC.scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
  });

  it("scrolls the newly-selected row into view after an ArrowUp move", () => {
    render(<Harness initialSelectedId="b" />);
    const rowA = screen.getByTestId("row-a");
    rowA.scrollIntoView = vi.fn();

    pressArrowUp();

    expect(rowA.scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
  });

  it("does not scroll again when clamped at the last row (no actual selection change)", () => {
    render(<Harness initialSelectedId="c" />);
    const rowC = screen.getByTestId("row-c");
    rowC.scrollIntoView = vi.fn();

    pressArrowDown();

    expect(rowC.scrollIntoView).not.toHaveBeenCalled();
  });

  it("scrolls the initially-selected row into view on mount too", () => {
    const calls: Element[] = [];
    const spy = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (this: Element) {
      calls.push(this);
    });

    render(<Harness initialSelectedId="b" />);

    expect(calls).toContain(screen.getByTestId("row-b"));
    spy.mockRestore();
  });
});
