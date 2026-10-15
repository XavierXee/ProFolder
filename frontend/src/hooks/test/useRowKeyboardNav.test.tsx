import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { useRowKeyboardNav } from "../useRowKeyboardNav.js";

type Item = { id: string };

const ITEMS: Item[] = [{ id: "a" }, { id: "b" }, { id: "c" }];

function Harness({
  active = true,
  items = ITEMS,
  initialSelectedId = "b",
  onSelectSpy,
  onEnter,
  onSpace,
}: {
  active?: boolean;
  items?: Item[];
  initialSelectedId?: string | null;
  onSelectSpy?: (id: string) => void;
  onEnter?: (id: string) => void;
  onSpace?: (id: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  function onSelect(id: string) {
    setSelectedId(id);
    onSelectSpy?.(id);
  }
  useRowKeyboardNav({ active, items, selectedId, onSelect, onEnter, onSpace });
  return (
    <div>
      <p data-testid="selected">{selectedId ?? "none"}</p>
      <input data-testid="text-input" />
      <textarea data-testid="textarea" />
      <button data-testid="plain-button">Plain button</button>
      <div role="dialog" aria-label="Detail">
        <button data-testid="dialog-button">Status pill</button>
        <button aria-label="Close panel" data-testid="close-button">
          X
        </button>
      </div>
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

function pressEnter(target: Element = document.body) {
  fireEvent.keyDown(target, { key: "Enter" });
}

function pressSpace(target: Element = document.body) {
  fireEvent.keyDown(target, { key: " " });
}

describe("useRowKeyboardNav - ArrowUp/ArrowDown", () => {
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

  it("ArrowDown with nothing selected highlights the first row (keyboard-only browsing from a fresh tab)", () => {
    const onSelectSpy = vi.fn();
    render(<Harness initialSelectedId={null} onSelectSpy={onSelectSpy} />);
    pressArrowDown();
    expect(onSelectSpy).toHaveBeenCalledWith("a");
    expect(screen.getByTestId("selected")).toHaveTextContent("a");
  });

  it("ArrowUp with nothing selected highlights the last row", () => {
    const onSelectSpy = vi.fn();
    render(<Harness initialSelectedId={null} onSelectSpy={onSelectSpy} />);
    pressArrowUp();
    expect(onSelectSpy).toHaveBeenCalledWith("c");
    expect(screen.getByTestId("selected")).toHaveTextContent("c");
  });

  it("does nothing with nothing selected and an empty item list", () => {
    const onSelectSpy = vi.fn();
    render(<Harness items={[]} initialSelectedId={null} onSelectSpy={onSelectSpy} />);
    pressArrowDown();
    expect(onSelectSpy).not.toHaveBeenCalled();
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

  it("still navigates when focus is on a plain button (arrow keys have no native button behavior to protect)", () => {
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

describe("useRowKeyboardNav - Enter", () => {
  it("calls onEnter with the highlighted row's id", () => {
    const onEnter = vi.fn();
    render(<Harness initialSelectedId="b" onEnter={onEnter} />);
    pressEnter();
    expect(onEnter).toHaveBeenCalledWith("b");
  });

  it("does nothing when nothing is selected", () => {
    const onEnter = vi.fn();
    render(<Harness initialSelectedId={null} onEnter={onEnter} />);
    pressEnter();
    expect(onEnter).not.toHaveBeenCalled();
  });

  it("does nothing when onEnter isn't provided", () => {
    expect(() => {
      render(<Harness initialSelectedId="b" />);
      pressEnter();
    }).not.toThrow();
  });

  it("does nothing while focus is in a text input/textarea", () => {
    const onEnter = vi.fn();
    render(<Harness initialSelectedId="b" onEnter={onEnter} />);
    const input = screen.getByTestId("text-input");
    input.focus();
    pressEnter(input);
    expect(onEnter).not.toHaveBeenCalled();
  });

  it("still fires while focus is on a button OUTSIDE any dialog — e.g. stale focus left on a tab-switcher button after an earlier click, which must not silently break this shortcut", () => {
    const onEnter = vi.fn();
    render(<Harness initialSelectedId="b" onEnter={onEnter} />);
    const button = screen.getByTestId("plain-button");
    button.focus();
    pressEnter(button);
    expect(onEnter).toHaveBeenCalledWith("b");
  });

  it("does nothing while focus is on a button INSIDE an open dialog (keeps that button's own native Enter activation)", () => {
    const onEnter = vi.fn();
    render(<Harness initialSelectedId="b" onEnter={onEnter} />);
    const dialogButton = screen.getByTestId("dialog-button");
    dialogButton.focus();
    pressEnter(dialogButton);
    expect(onEnter).not.toHaveBeenCalled();
  });

  it("does nothing while focus is on the detail panel's close button either — unlike Space, Enter has no carve-out", () => {
    const onEnter = vi.fn();
    render(<Harness initialSelectedId="b" onEnter={onEnter} />);
    const closeButton = screen.getByTestId("close-button");
    closeButton.focus();
    pressEnter(closeButton);
    expect(onEnter).not.toHaveBeenCalled();
  });
});

describe("useRowKeyboardNav - Space", () => {
  it("calls onSpace with the highlighted row's id when provided (e.g. Files tabs toggling playback)", () => {
    const onEnter = vi.fn();
    const onSpace = vi.fn();
    render(<Harness initialSelectedId="b" onEnter={onEnter} onSpace={onSpace} />);
    pressSpace();
    expect(onSpace).toHaveBeenCalledWith("b");
    expect(onEnter).not.toHaveBeenCalled();
  });

  it("falls back to onEnter when onSpace is omitted (e.g. Projects tabs, which have no playback concept)", () => {
    const onEnter = vi.fn();
    render(<Harness initialSelectedId="b" onEnter={onEnter} />);
    pressSpace();
    expect(onEnter).toHaveBeenCalledWith("b");
  });

  it("does nothing when nothing is selected", () => {
    const onSpace = vi.fn();
    render(<Harness initialSelectedId={null} onSpace={onSpace} />);
    pressSpace();
    expect(onSpace).not.toHaveBeenCalled();
  });

  it("does nothing while focus is in a text input/textarea, so typing a literal space still works", () => {
    const onSpace = vi.fn();
    render(<Harness initialSelectedId="b" onSpace={onSpace} />);
    const textarea = screen.getByTestId("textarea");
    textarea.focus();
    pressSpace(textarea);
    expect(onSpace).not.toHaveBeenCalled();
  });

  it("still fires while focus is on a button OUTSIDE any dialog — the bug this was fixed for: the first highlighted row's Space shortcut silently did nothing after merely clicking a tab-switcher button, until the detail panel had been opened and closed at least once", () => {
    const onSpace = vi.fn();
    render(<Harness initialSelectedId="b" onSpace={onSpace} />);
    const button = screen.getByTestId("plain-button");
    button.focus();
    pressSpace(button);
    expect(onSpace).toHaveBeenCalledWith("b");
  });

  it("does nothing while focus is on an ordinary button INSIDE an open dialog (keeps that button's own native Space activation)", () => {
    const onSpace = vi.fn();
    render(<Harness initialSelectedId="b" onSpace={onSpace} />);
    const dialogButton = screen.getByTestId("dialog-button");
    dialogButton.focus();
    pressSpace(dialogButton);
    expect(onSpace).not.toHaveBeenCalled();
  });

  it("still fires while focus is on the detail panel's auto-focused close button specifically", () => {
    const onSpace = vi.fn();
    render(<Harness initialSelectedId="b" onSpace={onSpace} />);
    const closeButton = screen.getByTestId("close-button");
    closeButton.focus();
    pressSpace(closeButton);
    expect(onSpace).toHaveBeenCalledWith("b");
  });
});

// scrollIntoView is stubbed on Element.prototype itself (see test-setup.ts, jsdom doesn't
// implement it at all), so every element shares the same mock function by default — each test
// below assigns a fresh vi.fn() as an own property on the specific row under test, shadowing
// the shared prototype stub, so the assertion can't be satisfied by some OTHER row's call.
describe("useRowKeyboardNav - keeps the selected row scrolled into view", () => {
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
