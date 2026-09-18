import { useEffect, useState } from "react";
import * as api from "../api/client.js";
import type { ConfirmationSettings } from "../api/client.js";

/** Fetches whether a given confirmation type is currently required, re-fetching fresh every
 * time `active` transitions to true (so a Settings change is picked up on next use without a
 * page reload). Fails safe to `true` (required) while the fetch is in flight, matching this
 * feature's "default true, protective" philosophy (see src/config/confirmationSettings.ts). */
export function useConfirmationRequired(field: keyof ConfirmationSettings, active: boolean): boolean {
  const [settings, setSettings] = useState<ConfirmationSettings | null>(null);
  useEffect(() => {
    if (!active) return;
    setSettings(null);
    api.getConfirmationSettings().then(setSettings);
  }, [active, field]);
  return settings === null || settings[field];
}
