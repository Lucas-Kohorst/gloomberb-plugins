import type { CliLaunchRequest } from "gloomberb/types/plugin";
import { cloneLayout, createPaneInstance, type AppConfig } from "gloomberb/types/config";
import { PREDICTION_CATEGORY_OPTIONS, type PredictionCategoryId } from "./categories";
import { BROWSE_TABS } from "./navigation";
import type { PredictionBrowseTab, PredictionVenueScope } from "./types";

const PREDICTION_PANE_ID = "prediction-markets";
const PREDICTION_MAIN_INSTANCE_ID = `${PREDICTION_PANE_ID}:main`;

const VENUE_SCOPE_SET = new Set<PredictionVenueScope>(["all", "polymarket", "kalshi"]);
const CATEGORY_ID_SET = new Set<PredictionCategoryId>(
  PREDICTION_CATEGORY_OPTIONS.map((option) => option.id),
);
const BROWSE_TAB_SET = new Set<PredictionBrowseTab>(
  BROWSE_TABS.map((tab) => tab.value),
);

export interface PredictionLaunchIntent {
  venueScope: PredictionVenueScope;
  categoryId: PredictionCategoryId;
  browseTab: PredictionBrowseTab;
  searchQuery: string;
}

function normalizeArg(value: string): string {
  return value.trim().toLowerCase();
}

export function parsePredictionCommandArgs(args: string[]): PredictionLaunchIntent {
  let venueScope: PredictionVenueScope = "all";
  let categoryId: PredictionCategoryId = "all";
  let browseTab: PredictionBrowseTab = "top";
  let venueExplicit = false;
  let categoryExplicit = false;
  let browseExplicit = false;
  const searchTokens: string[] = [];

  for (const arg of args) {
    const normalized = normalizeArg(arg);
    if (!normalized) continue;
    if (!venueExplicit && VENUE_SCOPE_SET.has(normalized as PredictionVenueScope)) {
      venueScope = normalized as PredictionVenueScope;
      venueExplicit = true;
      continue;
    }
    if (!categoryExplicit && CATEGORY_ID_SET.has(normalized as PredictionCategoryId)) {
      categoryId = normalized as PredictionCategoryId;
      categoryExplicit = true;
      continue;
    }
    if (!browseExplicit && BROWSE_TAB_SET.has(normalized as PredictionBrowseTab)) {
      browseTab = normalized as PredictionBrowseTab;
      browseExplicit = true;
      continue;
    }
    searchTokens.push(arg);
  }

  return { venueScope, categoryId, browseTab, searchQuery: searchTokens.join(" ").trim() };
}

export function parsePredictionLaunchArgs(args: string[]): PredictionLaunchIntent | null {
  const [command, ...rest] = args;
  if (!command) return null;
  const normalized = normalizeArg(command);
  if (normalized !== "predictions" && normalized !== "prediction-markets" && normalized !== "pm") {
    return null;
  }
  return parsePredictionCommandArgs(rest);
}

function applyIntentToLayout(
  config: AppConfig,
  intent: PredictionLaunchIntent,
  terminalSize: { width: number; height: number },
): AppConfig {
  const layout = cloneLayout(config.layout);
  const existing = layout.instances.find((instance) => instance.paneId === PREDICTION_PANE_ID);
  const instance = existing ?? createPaneInstance(PREDICTION_PANE_ID, {
    instanceId: PREDICTION_MAIN_INSTANCE_ID,
    params: {
      scope: intent.venueScope,
      category: intent.categoryId,
      browseTab: intent.browseTab,
      query: intent.searchQuery,
    },
  });
  const instances = existing
    ? layout.instances.map((candidate) => candidate.instanceId === existing.instanceId
      ? {
          ...candidate,
          params: {
            ...(candidate.params ?? {}),
            scope: intent.venueScope,
            category: intent.categoryId,
            browseTab: intent.browseTab,
            query: intent.searchQuery,
          },
        }
      : candidate)
    : [...layout.instances, instance];
  const instanceId = instance.instanceId;
  const floating = layout.floating.some((entry) => entry.instanceId === instanceId)
    ? layout.floating
    : [
        ...layout.floating,
        {
          instanceId,
          x: 0,
          y: 0,
          width: Math.max(120, terminalSize.width),
          height: Math.max(36, terminalSize.height),
        },
      ];
  const nextLayout = { ...layout, instances, floating };
  return {
    ...config,
    layout: nextLayout,
    layouts: config.layouts.map((entry, index) => index === config.activeLayoutIndex
      ? { ...entry, layout: cloneLayout(nextLayout) }
      : entry),
  };
}

export function createPredictionLaunchRequest(
  intent: PredictionLaunchIntent,
): CliLaunchRequest {
  return {
    applyConfig(config, env) {
      return {
        config: applyIntentToLayout(config, intent, {
          width: Math.max(env.terminalWidth, 120),
          height: Math.max(env.terminalHeight, 40),
        }),
      };
    },
  };
}
