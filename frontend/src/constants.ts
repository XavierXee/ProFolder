/** Shared page size for the audio files and projects list views. There is no
 * page-size selector in the UI, so this is the single source of truth for
 * both the default `pageSize` filter value and any UI that reserves layout
 * space based on the maximum number of rows selectable on one page (e.g. the
 * Batch Edit button label in FilterToolbar). */
export const PAGE_SIZE = 50;
