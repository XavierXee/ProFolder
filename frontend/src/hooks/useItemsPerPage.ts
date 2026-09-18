import { useEffect, useState } from "react";
import * as api from "../api/client.js";
import { PAGE_SIZE } from "../constants.js";

type Listener = (itemsPerPage: number) => void;
const listeners = new Set<Listener>();
let cachedValue: number | null = null;
let fetchPromise: Promise<number> | null = null;

function fetchOnce(): Promise<number> {
  if (cachedValue !== null) return Promise.resolve(cachedValue);
  if (!fetchPromise) {
    fetchPromise = api.getPaginationSettings().then((s) => {
      cachedValue = s.itemsPerPage;
      return cachedValue;
    });
  }
  return fetchPromise;
}

/** Returns the current items-per-page setting, starting at the hardcoded PAGE_SIZE default
 * until the real value loads, then updating live. Every mounted instance of this hook
 * (default Projects/Files tabs, any active custom tab panel) re-renders with the new value
 * the moment `setItemsPerPageGlobally` is called anywhere — this is what makes the Settings
 * panel's "Apply" button take effect instantly across every currently-open tab, not just on
 * next mount. */
export function useItemsPerPage(): number {
  const [value, setValue] = useState(cachedValue ?? PAGE_SIZE);
  useEffect(() => {
    let cancelled = false;
    fetchOnce().then((v) => {
      if (!cancelled) setValue(v);
    });
    const listener: Listener = (v) => setValue(v);
    listeners.add(listener);
    return () => {
      cancelled = true;
      listeners.delete(listener);
    };
  }, []);
  return value;
}

/** Call after a successful `api.setPaginationSettings(...)` to push the new value live to
 * every currently-mounted `useItemsPerPage()` consumer. */
export function setItemsPerPageGlobally(itemsPerPage: number): void {
  cachedValue = itemsPerPage;
  listeners.forEach((listener) => listener(itemsPerPage));
}
