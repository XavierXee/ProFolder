/** What a library import (`POST /api/library/import`) changed. */
export type ImportSummary = {
  projects: ImportItemCounts;
  files: ImportItemCounts;
  statusesAdded: number;
  tagsAdded: number;
  customTabsAdded: number;
  /** Custom tabs in the file whose name this library already uses: left as they are. */
  customTabsKept: number;
  settingsApplied: number;
  /** Settings this library had already changed from the default: left as they are. */
  settingsKept: number;
  scanExclusionsApplied: boolean;
};

export type ImportItemCounts = {
  /** Matched an item here and filled in at least one value. */
  updated: number;
  /** Matched an item here that already had everything the file had. */
  unchanged: number;
  /** Not in this library (matched by path relative to the music folder): skipped. */
  notInLibrary: number;
};
