import type { CSSProperties } from "react";

/**
 * Derives an inline badge style from a single user-supplied hex color, for statuses that come
 * from the dynamic catalog (see StatusCatalogContext) rather than the fixed `STATUS_BADGE` token
 * map in statusStyles.ts. Mirrors that map's 15%-surface/30%-ring convention, but computed at
 * runtime from one hex value instead of a precomputed per-theme oklch pair. Mixing with
 * `var(--color-ink)` for the text color keeps it legible against all 3 themes without any
 * JS theme-detection branching, since the ink token itself already flips per `[data-theme]`.
 */
export function statusBadgeStyle(hex: string): CSSProperties {
  return {
    backgroundColor: `color-mix(in oklch, ${hex} 15%, transparent)`,
    color: `color-mix(in oklch, var(--color-ink) 35%, ${hex} 65%)`,
    boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${hex} 30%, transparent)`,
  };
}

/**
 * Derives an inline "selected" pill style from a single user-supplied hex color, for the
 * FileDetailPanel/ProjectDetailPanel status pickers' selected-status button. Mirrors the fixed
 * `STATUS_PILL` token map's default/dark-theme percentages (10%-surface/40%-border/30%-ring,
 * confirmed by grepping index.css's `--rt-status-*-pill-*` values for that theme block) — the
 * light/profolder theme blocks use distinct precomputed oklch pairs per role rather than a simple
 * alpha-mix of one hue, so this runtime approximation only matches the dark theme's convention
 * exactly, same accepted tradeoff as `statusBadgeStyle` above. Computed at runtime from one hex
 * value instead of a precomputed per-theme oklch pair. The `boxShadow` inset mimics the token
 * map's `ring-1 ring-*` pairing without needing a Tailwind ring-color utility class.
 */
export function statusPillStyle(hex: string): CSSProperties {
  return {
    backgroundColor: `color-mix(in oklch, ${hex} 10%, transparent)`,
    color: `color-mix(in oklch, var(--color-ink) 35%, ${hex} 65%)`,
    borderColor: `color-mix(in oklch, ${hex} 40%, transparent)`,
    boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${hex} 30%, transparent)`,
  };
}
