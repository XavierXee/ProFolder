/** Express (via qs) parses a repeated query key (`?tag=a&tag=b`) into a string array,
 * and a single occurrence into a plain string — this normalizes either shape to an array. */
export function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  if (typeof value === "string") return [value];
  return [];
}
