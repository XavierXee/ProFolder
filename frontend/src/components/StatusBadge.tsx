import type { TrackStatus } from "../types.js";
import { STATUS_BADGE_DARK, STATUS_BADGE_LIGHT, STATUS_LABELS } from "../statusStyles.js";

export default function StatusBadge({ status, isDark = true }: { status: TrackStatus; isDark?: boolean }) {
  const label = STATUS_LABELS[status];
  const cls = isDark ? STATUS_BADGE_DARK[status] : STATUS_BADGE_LIGHT[status];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-[var(--rt-radius)] text-xs font-mono font-medium ring-1 ${cls}`}
      aria-label={`Status: ${label}`}
    >
      {label}
    </span>
  );
}
