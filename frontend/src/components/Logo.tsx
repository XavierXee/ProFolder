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
 */
export default function Logo({ size = 28 }: { size?: number }) {
  return (
    <div
      className="relative shrink-0 overflow-hidden"
      style={{ width: size, height: size, backgroundColor: "#1C1C1A" }}
      aria-hidden="true"
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
