import type { TrackStatus } from "../types.js";
import { STATUS_BADGE, STATUS_LABELS } from "../statusStyles.js";

export default function StatusBadge({ status }: { status: TrackStatus }) {
  const label = STATUS_LABELS[status];
  const cls = STATUS_BADGE[status];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-[var(--rt-radius)] text-xs font-mono font-medium ring-1 ${cls}`}
      aria-label={`Status: ${label}`}
    >
      {label}
    </span>
  );
}
