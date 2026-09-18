import { useState } from "react";

/** Tracks the text a user types into a "type X to confirm" input, and whether it currently
 * satisfies the required confirmation. When `required` is false, `satisfied` is always true
 * (the caller's action button should not be blocked) regardless of `value`. Comparison is
 * exact/case-sensitive — callers pass the exact casing they want the user to match (e.g. the
 * literal tab/tag name, or an uppercase keyword like "DELETE"). Callers are responsible for
 * calling `reset()` when their dialog re-opens (e.g. in their existing open-effect), so stale
 * typed text from a previous open doesn't leak into a new one. Submitting on Enter is
 * deliberately left to the consuming dialog (e.g. wiring an `onKeyDown` on its own input), not
 * handled here. */
export function useTypedConfirmation(expectedText: string, required: boolean) {
  const [value, setValue] = useState("");
  const satisfied = !required || value === expectedText;
  function reset() {
    setValue("");
  }
  return { value, setValue, satisfied, reset };
}
