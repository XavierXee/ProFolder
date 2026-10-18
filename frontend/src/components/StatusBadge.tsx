import type { TrackStatus } from "../types.js";
import { UNKNOWN_STATUS_KEY } from "../types.js";
import { STATUS_BADGE, STATUS_LABELS } from "../statusStyles.js";
import { statusBadgeStyle } from "../statusColor.js";
import { useStatusCatalog } from "../contexts/StatusCatalogContext.js";

/** Neutral layout classes (no color) shared by the catalog-driven and fallback badge renders —
 * color comes from an inline style for the former, and reuses the `unknown` token classes for
 * the latter, so there's no unstyled flash while the catalog is loading. */
const NEUTRAL_LAYOUT_CLS = "inline-flex items-center px-2 py-0.5 rounded-[var(--rt-radius)] text-xs font-mono font-medium ring-1";

/** Joins class-name fragments with single spaces, dropping any empty ones — avoids a stray
 * trailing space when the optional `className` prop (below) isn't given. */
function cx(...parts: string[]): string {
  return parts.filter(Boolean).join(" ");
}

export default function StatusBadge({ status, className = "" }: { status: TrackStatus; className?: string }) {
  // While the catalog is still loading, `statuses` is empty, so lookups below naturally miss
  // and fall through to the same neutral fallback treatment used for orphan status values.
  const { statuses } = useStatusCatalog();

  if (status === UNKNOWN_STATUS_KEY) {
    const label = STATUS_LABELS.unknown;
    const cls = STATUS_BADGE.unknown;
    return (
      <span className={cx(NEUTRAL_LAYOUT_CLS, cls, className)} aria-label={`Status: ${label}`}>
        {label}
      </span>
    );
  }

  const found = statuses.find((s) => s.key === status);

  if (found) {
    return (
      <span className={cx(NEUTRAL_LAYOUT_CLS, className)} style={statusBadgeStyle(found.color)} aria-label={`Status: ${found.name}`}>
        {found.name}
      </span>
    );
  }

  // Orphan status not in the catalog, or the catalog is still loading — fall back to the raw
  // key with the same gray treatment used for the "unknown" sentinel, so there's no unstyled
  // flash while loading.
  return (
    <span className={cx(NEUTRAL_LAYOUT_CLS, STATUS_BADGE.unknown, className)} aria-label={`Status: ${status}`}>
      {status}
    </span>
  );
}
