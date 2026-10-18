import type { TrackStatus } from "../types.js";
import { UNKNOWN_STATUS_KEY } from "../types.js";
import { STATUS_BADGE, STATUS_LABELS } from "../statusStyles.js";
import { statusBadgeStyle } from "../statusColor.js";
import { useStatusCatalog } from "../contexts/StatusCatalogContext.js";

/** Neutral layout classes (no color) shared by the catalog-driven and fallback badge renders —
 * color comes from an inline style for the former, and reuses the `unknown` token classes for
 * the latter, so there's no unstyled flash while the catalog is loading. */
const NEUTRAL_LAYOUT_CLS = "px-2 py-0.5 rounded-[var(--rt-radius)] text-xs font-mono font-medium ring-1";
const DISPLAY_CLS = "inline-flex items-center";
/** A flex container can't ellipsize its text, so the truncating variant is an inline-block
 * capped at its container's width instead — one line, with an ellipsis (and the app-wide
 * hover-to-scroll) when the name doesn't fit. */
const TRUNCATE_DISPLAY_CLS = "inline-block max-w-full align-middle truncate";

/** Joins class-name fragments with single spaces, dropping any empty ones — avoids a stray
 * trailing space when the optional `className` prop (below) isn't given. */
function cx(...parts: string[]): string {
  return parts.filter(Boolean).join(" ");
}

export default function StatusBadge({
  status,
  className = "",
  truncate = false,
}: {
  status: TrackStatus;
  className?: string;
  truncate?: boolean;
}) {
  // While the catalog is still loading, `statuses` is empty, so lookups below naturally miss
  // and fall through to the same neutral fallback treatment used for orphan status values.
  const { statuses } = useStatusCatalog();
  const layoutCls = cx(truncate ? TRUNCATE_DISPLAY_CLS : DISPLAY_CLS, NEUTRAL_LAYOUT_CLS);

  if (status === UNKNOWN_STATUS_KEY) {
    const label = STATUS_LABELS.unknown;
    const cls = STATUS_BADGE.unknown;
    return (
      <span className={cx(layoutCls, cls, className)} aria-label={`Status: ${label}`}>
        {label}
      </span>
    );
  }

  const found = statuses.find((s) => s.key === status);

  if (found) {
    return (
      <span className={cx(layoutCls, className)} style={statusBadgeStyle(found.color)} aria-label={`Status: ${found.name}`}>
        {found.name}
      </span>
    );
  }

  // Orphan status not in the catalog, or the catalog is still loading — fall back to the raw
  // key with the same gray treatment used for the "unknown" sentinel, so there's no unstyled
  // flash while loading.
  return (
    <span className={cx(layoutCls, STATUS_BADGE.unknown, className)} aria-label={`Status: ${status}`}>
      {status}
    </span>
  );
}
