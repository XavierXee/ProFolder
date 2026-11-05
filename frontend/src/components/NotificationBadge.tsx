import { useEffect, useRef } from "react";

export const NOTIFICATION_DURATION_MS = 2000;

/**
 * A short-lived notification floating at the top of the window, above everything else. It
 * dismisses itself after `durationMs`, or straight away with its close button. The timer starts
 * when it mounts, so give each new notification its own `key` to restart it.
 */
export default function NotificationBadge({
  message,
  onDismiss,
  durationMs = NOTIFICATION_DURATION_MS,
}: {
  message: string;
  onDismiss: () => void;
  durationMs?: number;
}) {
  // onDismiss is usually a fresh closure each render; read through a ref so a parent re-render
  // doesn't restart the timer (which would keep the notification up indefinitely).
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    const timer = setTimeout(() => onDismissRef.current(), durationMs);
    return () => clearTimeout(timer);
  }, [durationMs]);

  return (
    <div className="fixed top-3 inset-x-0 z-[60] flex justify-center px-4 pointer-events-none">
      {/* The info colors are translucent, so they sit on an opaque surface to stay readable over the page. */}
      <div className="pointer-events-auto max-w-xl rounded-[var(--rt-radius)] bg-surface shadow-lg">
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-3 pl-3 pr-1.5 py-1.5 rounded-[var(--rt-radius)] border border-border text-xs font-mono bg-info-surface text-info"
        >
          <span className="py-0.5">{message}</span>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss notification"
            className="shrink-0 flex items-center justify-center w-5 h-5 rounded-[var(--rt-radius)] opacity-70 hover:opacity-100 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
