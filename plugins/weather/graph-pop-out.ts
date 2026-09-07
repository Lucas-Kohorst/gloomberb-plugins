/**
 * Chart-composer pop-out helper for weather graph actions.
 *
 * The first-party helper lives in the builtin shared folder and is not part of
 * the public `gloomberb/*` surface; this is a local copy built from
 * `usePluginAppActions` (`gloomberb/react`) and the `PaneHint` shape
 * (`gloomberb/components`).
 */
import { useCallback } from "react";
import type { PaneHint } from "gloomberb/components";
import { usePluginAppActions } from "gloomberb/react";

/** Command-bar / pane-template id for the floating Custom Chart composer. */
export const CHART_COMPOSER_TEMPLATE_ID = "chart-composer-pane";

export function openChartComposerPopOut(
  createPaneFromTemplate: (templateId: string, options?: { arg?: string }) => void,
  expression: string | null | undefined,
): boolean {
  const arg = expression?.trim();
  if (!arg) return false;
  createPaneFromTemplate(CHART_COMPOSER_TEMPLATE_ID, { arg });
  return true;
}

export function graphFooterHint(onGraph: () => void, enabled = true): PaneHint {
  return {
    id: "graph",
    key: "g",
    label: "raph",
    onPress: onGraph,
    disabled: !enabled,
  };
}

export function useGraphChartPopOut() {
  const { createPaneFromTemplate } = usePluginAppActions();
  return useCallback((expression: string | null | undefined) => {
    openChartComposerPopOut(createPaneFromTemplate, expression);
  }, [createPaneFromTemplate]);
}
