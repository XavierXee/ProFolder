import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTypedConfirmation } from "../useTypedConfirmation.js";

describe("useTypedConfirmation - required is false", () => {
  it("is satisfied immediately regardless of value", () => {
    const { result } = renderHook(() => useTypedConfirmation("DELETE", false));

    expect(result.current.satisfied).toBe(true);

    act(() => {
      result.current.setValue("anything");
    });

    expect(result.current.satisfied).toBe(true);
  });
});

describe("useTypedConfirmation - required is true", () => {
  it("starts unsatisfied when value is empty", () => {
    const { result } = renderHook(() => useTypedConfirmation("DELETE", true));

    expect(result.current.value).toBe("");
    expect(result.current.satisfied).toBe(false);
  });

  it("remains unsatisfied when value does not exactly match expectedText", () => {
    const { result } = renderHook(() => useTypedConfirmation("DELETE", true));

    act(() => {
      result.current.setValue("DELET");
    });

    expect(result.current.satisfied).toBe(false);
  });

  it("becomes satisfied once value exactly matches expectedText", () => {
    const { result } = renderHook(() => useTypedConfirmation("DELETE", true));

    act(() => {
      result.current.setValue("DELETE");
    });

    expect(result.current.satisfied).toBe(true);
  });

  it("is case-sensitive -- a differently-cased near-match does not satisfy it", () => {
    const { result } = renderHook(() => useTypedConfirmation("DELETE", true));

    act(() => {
      result.current.setValue("delete");
    });

    expect(result.current.satisfied).toBe(false);
  });
});

describe("useTypedConfirmation - reset", () => {
  it("clears value back to an empty string", () => {
    const { result } = renderHook(() => useTypedConfirmation("DELETE", true));

    act(() => {
      result.current.setValue("DELETE");
    });
    expect(result.current.value).toBe("DELETE");
    expect(result.current.satisfied).toBe(true);

    act(() => {
      result.current.reset();
    });

    expect(result.current.value).toBe("");
    expect(result.current.satisfied).toBe(false);
  });
});
