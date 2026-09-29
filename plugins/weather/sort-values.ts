/**
 * Sort helpers for data-table panes, inlined from the first-party
 * `src/utils/sort-values` module. The public `gloomberb/utils` surface exposes
 * `compareSortValues` and `SortPreference`; `applySortPreference` and
 * `nextSortPreference` are added here so this plugin's tables sort like the
 * built-in panes.
 */

import { compareSortValues } from "gloomberb/utils";
import type { SortPreference } from "gloomberb/utils";

export type { SortPreference } from "gloomberb/utils";

export type SortComparableValue = string | number | null | undefined;

export interface NextSortPreferenceOptions<Id extends string> {
  /**
   * Direction a column starts in on its first click. Pass a function when it
   * depends on the column, e.g. text columns ascending and numeric descending.
   * Defaults to descending.
   */
  readonly defaultDirection?: SortPreference<Id>["direction"] | ((columnId: Id) => SortPreference<Id>["direction"]);
  /**
   * Where the third click lands. Omit it to toggle between the two directions
   * forever; pass the pane's natural order to end the cycle.
   */
  readonly resetTo?: SortPreference<Id>;
}

/**
 * Advance a table's sort state for a header click. Mirrors the built-in
 * `nextSortPreference` so there is one cycle to reason about.
 */
export function nextSortPreference<Id extends string>(
  current: SortPreference<Id>,
  columnId: Id,
  options: NextSortPreferenceOptions<Id> = {},
): SortPreference<Id> {
  const { defaultDirection = "desc", resetTo } = options;
  const opening = typeof defaultDirection === "function"
    ? defaultDirection(columnId)
    : defaultDirection;

  if (current.columnId !== columnId) return { columnId, direction: opening };
  if (current.direction === opening) {
    return { columnId, direction: opening === "asc" ? "desc" : "asc" };
  }
  return resetTo ?? { columnId, direction: opening };
}

/**
 * Sort `rows` by whatever `value()` reports for the active column, leaving the
 * caller's order untouched when nothing is sorted. Always returns a new array.
 */
export function applySortPreference<T, Id extends string>(
  rows: readonly T[],
  sort: SortPreference<Id>,
  value: (row: T, columnId: Id) => SortComparableValue,
): T[] {
  const columnId = sort.columnId;
  if (!columnId) return [...rows];
  return [...rows].sort((a, b) => compareSortValues(
    value(a, columnId),
    value(b, columnId),
    sort.direction,
  ));
}
