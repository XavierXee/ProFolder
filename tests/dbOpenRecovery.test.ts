import { describe, expect, it, vi } from "vitest";
import { recoverFromDbOpenFailure } from "../src/config/dbOpenRecovery.js";

describe("recoverFromDbOpenFailure", () => {
  it('on "reset": clears the override, then relaunches, and never quits', () => {
    const callOrder: string[] = [];
    const clearDbPathOverride = vi.fn((_prefsFilePath: string) => {
      callOrder.push("clear");
    });
    const relaunch = vi.fn(() => {
      callOrder.push("relaunch");
    });
    const quit = vi.fn();

    recoverFromDbOpenFailure("/fake/prefs.json", {
      showRecoveryDialog: () => "reset",
      clearDbPathOverride,
      relaunch,
      quit,
    });

    expect(clearDbPathOverride).toHaveBeenCalledOnce();
    expect(clearDbPathOverride).toHaveBeenCalledWith("/fake/prefs.json");
    expect(relaunch).toHaveBeenCalledOnce();
    expect(quit).not.toHaveBeenCalled();
    // Regression guard for the exact bug class this extraction exists to catch: clearing the
    // override must happen BEFORE relaunching, or the fresh launch would still see the (now
    // stale, still-broken) override and loop right back into the same failure.
    expect(callOrder).toEqual(["clear", "relaunch"]);
  });

  it('on "quit": quits without clearing the override or relaunching', () => {
    const clearDbPathOverride = vi.fn();
    const relaunch = vi.fn();
    const quit = vi.fn();

    recoverFromDbOpenFailure("/fake/prefs.json", {
      showRecoveryDialog: () => "quit",
      clearDbPathOverride,
      relaunch,
      quit,
    });

    expect(clearDbPathOverride).not.toHaveBeenCalled();
    expect(relaunch).not.toHaveBeenCalled();
    expect(quit).toHaveBeenCalledOnce();
  });
});
