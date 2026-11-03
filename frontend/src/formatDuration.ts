/** Formats a length in seconds as `m:ss`, or `h:mm:ss` from one hour up (e.g. 75 → "1:15",
 * 3723 → "1:02:03"). Fractions of a second are dropped. */
export function formatDuration(seconds: number): string {
  const whole = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = String(whole % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
