import type { GloomPlugin } from "gloomberb/types/plugin";
import { createConnection } from "gloomberb/plugins";
import { PollsPane } from "./pane";
import { POLLS_PANE_ID, POLLS_PLUGIN_ID } from "./types";
import { buildPollsPaneSettingsDef } from "./settings";
import { createPollChartSeriesCapability } from "./chart-series";

let disposeVoteHubConnection: (() => void) | null = null;

export const pollsPlugin: GloomPlugin = {
  id: POLLS_PLUGIN_ID,
  name: "Polls",
  version: "1.0.0",
  description: "Political polls from VoteHub (CC BY 4.0)",
  toggleable: true,
  targets: ["cli", "tui", "desktop"],
  homepage: "https://github.com/Lucas-Kohorst/gloomberb-plugins",

  capabilities: [createPollChartSeriesCapability()],

  setup(ctx) {
    disposeVoteHubConnection = createConnection(ctx, {
      id: "votehub",
      name: "VoteHub",
      kind: "api",
      authRequired: false,
    });
  },

  dispose() {
    disposeVoteHubConnection?.();
    disposeVoteHubConnection = null;
  },

  panes: [
    {
      id: POLLS_PANE_ID,
      name: "Polls",
      icon: "P",
      component: PollsPane,
      defaultPosition: "right",
      defaultMode: "floating",
      defaultFloatingSize: { width: 100, height: 32 },
      settings: (context) => buildPollsPaneSettingsDef(context.settings),
    },
  ],

  paneTemplates: [
    {
      id: "polls-pane",
      paneId: POLLS_PANE_ID,
      label: "Polls",
      description: "Browse VoteHub political polls — all types by default, or filter to approval, favorability, generic ballot, Senate, governor, House — with trend charts, pollster breakdowns, search, and source links.",
      keywords: ["polls", "votehub", "all", "approval", "favorability", "generic", "ballot", "senate", "governor"],
      shortcut: { prefix: "POLL" },
      createInstance: () => ({ placement: "floating" }),
    },
  ],
};

export default pollsPlugin;
