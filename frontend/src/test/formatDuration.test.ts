import { describe, expect, it } from "vitest";
import { formatDuration } from "../formatDuration.js";

describe("formatDuration", () => {
  it("formats under an hour as m:ss", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(75)).toBe("1:15");
    expect(formatDuration(3599.9)).toBe("59:59");
  });

  it("formats an hour or more as h:mm:ss", () => {
    expect(formatDuration(3600)).toBe("1:00:00");
    expect(formatDuration(3723)).toBe("1:02:03");
    expect(formatDuration(36000 + 59)).toBe("10:00:59");
  });

  it("treats negative or non-finite input as zero", () => {
    expect(formatDuration(-5)).toBe("0:00");
    expect(formatDuration(Number.NaN)).toBe("0:00");
  });
});
