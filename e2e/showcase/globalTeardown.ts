import { removeShowcaseLibrary } from "./showcaseLibrary.js";

/** Deletes the generated demo library and its database; the recorded video is kept. */
export default async function globalTeardown(): Promise<void> {
  removeShowcaseLibrary();
}
