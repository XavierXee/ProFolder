import { describe, expect, it, vi } from "vitest";
import { createWindowLauncher } from "../src/config/windowLauncher.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("createWindowLauncher", () => {
  it("doesn't open a window until the app is ready", async () => {
    const ready = deferred();
    const openWindow = vi.fn().mockResolvedValue(undefined);
    const launch = createWindowLauncher(() => ready.promise, openWindow);

    const launched = launch();
    await Promise.resolve();
    expect(openWindow).not.toHaveBeenCalled();

    ready.resolve();
    await launched;
    expect(openWindow).toHaveBeenCalledTimes(1);
  });

  it("shares one startup between calls made while it's still running", async () => {
    const ready = deferred();
    const openWindow = vi.fn().mockResolvedValue(undefined);
    const launch = createWindowLauncher(() => ready.promise, openWindow);

    // The initial launch plus an early `activate` and a second-instance launch.
    const calls = [launch(), launch(), launch()];
    ready.resolve();
    await Promise.all(calls);
    expect(openWindow).toHaveBeenCalledTimes(1);
  });

  it("starts a new one once the previous startup has finished", async () => {
    const openWindow = vi.fn().mockResolvedValue(undefined);
    const launch = createWindowLauncher(() => Promise.resolve(), openWindow);

    await launch();
    await launch();
    expect(openWindow).toHaveBeenCalledTimes(2);
  });

  it("passes a failure on to every caller, then lets a later call try again", async () => {
    const openWindow = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue(undefined);
    const launch = createWindowLauncher(() => Promise.resolve(), openWindow);

    const first = launch();
    const second = launch();
    await expect(first).rejects.toThrow("boom");
    await expect(second).rejects.toThrow("boom");

    await launch();
    expect(openWindow).toHaveBeenCalledTimes(2);
  });
});
