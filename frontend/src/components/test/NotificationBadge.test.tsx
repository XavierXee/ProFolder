import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import NotificationBadge, { NOTIFICATION_DURATION_MS } from "../NotificationBadge.js";

describe("NotificationBadge", () => {
  afterEach(() => vi.useRealTimers());

  it("shows the message in a status live region", () => {
    render(<NotificationBadge message="Scan complete." onDismiss={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent("Scan complete.");
  });

  it("dismisses itself after 2 seconds", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<NotificationBadge message="Scan complete." onDismiss={onDismiss} />);

    expect(NOTIFICATION_DURATION_MS).toBe(2000);
    vi.advanceTimersByTime(1999);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("dismisses straight away from its close button", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<NotificationBadge message="Scan complete." onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("doesn't restart its timer when the parent re-renders with a new onDismiss", () => {
    vi.useFakeTimers();
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<NotificationBadge message="Scan complete." onDismiss={first} />);

    vi.advanceTimersByTime(1500);
    rerender(<NotificationBadge message="Scan complete." onDismiss={second} />);
    vi.advanceTimersByTime(500);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("stops its timer when unmounted", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const { unmount } = render(<NotificationBadge message="Scan complete." onDismiss={onDismiss} />);

    unmount();
    vi.advanceTimersByTime(NOTIFICATION_DURATION_MS);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
