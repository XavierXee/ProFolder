export const MIN_SCORE = 1;
export const MAX_SCORE = 5;

/** A score is either unset (null) or an integer in [MIN_SCORE, MAX_SCORE]. */
export function isValidScore(value: unknown): value is number | null {
  if (value === null) return true;
  return typeof value === "number" && Number.isInteger(value) && value >= MIN_SCORE && value <= MAX_SCORE;
}

/** Parses a single `?score=` value for filtering: "unscored" means "score IS NULL",
 * "1".."5" means an exact match, anything else means "not a valid score value". */
export function parseScoreQueryParam(value: unknown): number | null | undefined {
  if (typeof value !== "string") return undefined;
  if (value === "unscored") return null;
  const parsed = Number(value);
  return isValidScore(parsed) ? parsed : undefined;
}

/** Parses `?score=` values (repeated for multi-select — see queryParams.toStringArray)
 * into a list of exact scores / "unscored" (null), dropping any invalid entries.
 * Returns undefined (no filter) when nothing valid was given. */
export function parseScoreListQueryParam(values: string[]): (number | null)[] | undefined {
  const parsed = values
    .map((v) => parseScoreQueryParam(v))
    .filter((v): v is number | null => v !== undefined);
  return parsed.length > 0 ? parsed : undefined;
}
