const SLAB_CLIP_PATH = "polygon(14% 0, 100% 0, 86% 100%, 0 100%)";

const SLABS = [
  { top: "25%", background: "#FADF82" },
  { top: "43.75%", background: "linear-gradient(90deg, #FADF82, #D5F7FE)" },
  { top: "62.5%", background: "#D5F7FE" },
];

/**
 * The ProFolder logo mark: three sheared slabs (yellow -> gradient -> blue)
 * stacked on a near-black square tile. Purely presentational/static — no
 * theme-awareness, no conditional rendering. Scales proportionally via the
 * `size` prop using percentage-based absolute positioning.
 *
 * By default the mark is treated as decorative (`aria-hidden="true"`), which is correct
 * whenever it renders directly next to visible "ProFolder" text (e.g. the app header) — the
 * adjacent text already conveys the app identity to assistive tech. When the logo is the ONLY
 * thing conveying "ProFolder" on screen (e.g. the splash screen, which only otherwise shows
 * "Syncing..."), pass `ariaLabel` to give it a real accessible name instead.
 */
export default function Logo({ size = 28, ariaLabel }: { size?: number; ariaLabel?: string }) {
  return (
    <div
      className="relative shrink-0 overflow-hidden"
      style={{ width: size, height: size, backgroundColor: "#1C1C1A" }}
      {...(ariaLabel ? { "aria-label": ariaLabel } : { "aria-hidden": "true" })}
      data-testid="logo"
    >
      {SLABS.map((slab, i) => (
        <span
          key={i}
          data-testid="logo-slab"
          className="absolute"
          style={{
            left: "18.75%",
            width: "62.5%",
            top: slab.top,
            height: "12.5%",
            background: slab.background,
            clipPath: SLAB_CLIP_PATH,
          }}
        />
      ))}
    </div>
  );
}
