import type { PaneSettingsDef, PaneSettingField, PaneSettingOption } from "gloomberb/types/plugin";
import { DEFAULT_POLL_SORT, type PollSortColumnId, type PollSortPreference } from "./normalize";
import type { PollTabId } from "./types";

// ---------------------------------------------------------------------------
// Inlined from gloomberb's internal data-table column-settings and sort-settings
// (not exported from the public components barrel).
// ---------------------------------------------------------------------------

interface ColumnVisibilityColumn {
  id: string;
  label: string;
  description?: string;
}

function buildColumnVisibilityField(
  columns: readonly ColumnVisibilityColumn[],
): PaneSettingField {
  return {
    key: "columnIds",
    label: "Columns",
    type: "ordered-multi-select",
    options: columns.map((column) => ({
      value: column.id,
      label: column.label,
      description: column.description,
    })),
  };
}

function resolveVisibleColumns<T extends { id: string }>(
  columns: readonly T[],
  columnIds: unknown,
  defaultColumnIds: readonly string[],
): T[] {
  const savedIds = Array.isArray(columnIds)
    ? columnIds.filter((value): value is string => typeof value === "string")
    : [];
  const byId = new Map(columns.map((column) => [column.id, column]));
  const resolved = (savedIds.length > 0 ? savedIds : defaultColumnIds)
    .map((id) => byId.get(id))
    .filter((column): column is T => column != null);
  return resolved.length > 0
    ? resolved
    : columns.filter((column) => defaultColumnIds.includes(column.id));
}

type SortDirection = "asc" | "desc";

interface SortPreference<T extends string = string> {
  columnId: T;
  direction: SortDirection;
}

function encodeSortPreference(preference: SortPreference): string {
  return `${preference.columnId}:${preference.direction}`;
}

function parseSortPreference<T extends string>(
  value: unknown,
  allowedColumnIds: readonly T[],
  fallback: SortPreference<T>,
): SortPreference<T> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const candidate = value as { columnId?: unknown; direction?: unknown };
    if (typeof candidate.columnId === "string" && allowedColumnIds.includes(candidate.columnId as T)) {
      return {
        columnId: candidate.columnId as T,
        direction: candidate.direction === "asc" ? "asc" : "desc",
      };
    }
  }
  if (typeof value === "string") {
    const separator = value.lastIndexOf(":");
    const columnId = separator >= 0 ? value.slice(0, separator) : value;
    const direction = separator >= 0 ? value.slice(separator + 1) : "";
    if (allowedColumnIds.includes(columnId as T)) {
      return {
        columnId: columnId as T,
        direction: direction === "asc" ? "asc" : "desc",
      };
    }
  }
  return fallback;
}

function buildSortSelectField(
  options: readonly (PaneSettingOption & { value: string })[],
  extras?: { key?: string; label?: string; description?: string },
): PaneSettingField {
  return {
    key: extras?.key ?? "sort",
    label: extras?.label ?? "Default sort",
    description: extras?.description,
    type: "select",
    options: [...options],
  };
}

// ---------------------------------------------------------------------------
// Polls pane settings
// ---------------------------------------------------------------------------

export type PollColumnId = "date" | "subject" | "pollster" | "pop" | "result";

export const POLL_COLUMN_IDS: readonly PollColumnId[] = ["date", "subject", "pollster", "pop", "result"];
export const POLL_COLUMN_DEFS = [
  { id: "date", label: "DATE", description: "Poll end date." },
  { id: "subject", label: "SUBJECT", description: "Race or question." },
  { id: "pollster", label: "POLLSTER", description: "Polling firm." },
  { id: "pop", label: "POP", description: "Sample population." },
  { id: "result", label: "RESULT", description: "Headline result." },
] as const;

const POLL_TABS: Array<{ value: PollTabId; label: string }> = [
  { value: "all", label: "All" },
  { value: "approval", label: "Approval" },
  { value: "favorability", label: "Favorability" },
  { value: "generic-ballot", label: "Generic" },
  { value: "us-senator", label: "Senate" },
  { value: "governor", label: "Governor" },
  { value: "us-representative", label: "House" },
];

const POLL_TAB_IDS = POLL_TABS.map((tab) => tab.value);
const POLL_SORT_COLUMNS: readonly PollSortColumnId[] = POLL_COLUMN_IDS;

export function isPollTabId(value: unknown): value is PollTabId {
  return typeof value === "string" && POLL_TAB_IDS.includes(value as PollTabId);
}

export function getPollsPaneSettings(settings: Record<string, unknown> | undefined): {
  defaultTab: PollTabId;
  columnIds: PollColumnId[];
  sort: PollSortPreference;
} {
  const columnIds = resolveVisibleColumns(
    POLL_COLUMN_DEFS,
    settings?.columnIds,
    POLL_COLUMN_IDS,
  ).map((column) => column.id as PollColumnId);
  return {
    defaultTab: isPollTabId(settings?.defaultTab) ? settings.defaultTab : "all",
    columnIds: columnIds.length > 0 ? columnIds : [...POLL_COLUMN_IDS],
    sort: parseSortPreference(settings?.sort, POLL_SORT_COLUMNS, DEFAULT_POLL_SORT),
  };
}

export function buildPollsPaneSettingsDef(
  settings: Record<string, unknown> | undefined,
): PaneSettingsDef {
  const resolved = getPollsPaneSettings(settings);
  return {
    title: "Polls Settings",
    values: {
      defaultTab: resolved.defaultTab,
      columnIds: [...resolved.columnIds],
      sort: encodeSortPreference(resolved.sort),
    },
    fields: [
      {
        key: "defaultTab",
        label: "Default tab",
        description: "Race type shown when this pane opens.",
        type: "select",
        options: POLL_TABS,
      },
      buildColumnVisibilityField([...POLL_COLUMN_DEFS]),
      buildSortSelectField([
        { value: "date:desc", label: "Newest first" },
        { value: "date:asc", label: "Oldest first" },
        { value: "subject:asc", label: "Subject A–Z" },
        { value: "pollster:asc", label: "Pollster A–Z" },
        { value: "result:desc", label: "Largest lead" },
      ]),
    ],
  };
}
