import type { GloomPlugin } from "gloomberb/types/plugin";
import * as gloomPlugins from "gloomberb/plugins";
import { bindOpticOddsContext, OpticOddsPane } from "./pane";
import {
  OPTIC_ODDS_CONNECTION_ID,
  OPTIC_ODDS_PANE_ID,
  OPTIC_ODDS_PLUGIN_ID,
} from "./types";

function registerOpticByokService(): void {
  const register = gloomPlugins.registerByokKnownService;
  if (typeof register !== "function") return;
  register({
    id: "optic-odds",
    name: "OpticOdds",
    apiUrl: "https://api.opticodds.com/api/v3",
    authType: "header",
    authKey: "X-Api-Key",
    envVar: "OPTIC_ODDS_API_KEY",
    description: "Sportsbook odds, fixtures, and results.",
  });
}

let disposeConnection: (() => void) | null = null;

export const opticOddsPlugin: GloomPlugin = {
  id: OPTIC_ODDS_PLUGIN_ID,
  name: "OpticOdds",
  version: "1.0.0",
  description: "Sportsbook odds, fixtures, and results.",
  toggleable: true,
  targets: ["cli", "tui", "desktop"],
  homepage: "https://github.com/Lucas-Kohorst/gloomberb-plugins",
  panes: [{
    id: OPTIC_ODDS_PANE_ID,
    name: "OpticOdds",
    icon: "O",
    component: OpticOddsPane,
    defaultPosition: "right",
    defaultMode: "floating",
    defaultFloatingSize: { width: 100, height: 30 },
  }],
  paneTemplates: [{
    id: "optic-odds-pane",
    paneId: OPTIC_ODDS_PANE_ID,
    label: "OpticOdds",
    description: "Active sports fixtures with moneyline, spread, and total from a five-book OpticOdds basket.",
    keywords: ["odds", "sportsbook", "optic", "fixtures", "moneyline", "spread", "total"],
    category: "Data",
    shortcut: { prefix: "ODDS" },
    createInstance: () => ({ placement: "floating" }),
  }],
  setup(ctx) {
    bindOpticOddsContext(ctx);
    registerOpticByokService();
    disposeConnection = gloomPlugins.createConnection(ctx, {
      id: OPTIC_ODDS_CONNECTION_ID,
      name: "OpticOdds",
      kind: "api",
      authRequired: true,
      priority: 430,
      byok: {
        description: "Sportsbook odds, fixtures, and results.",
        apiUrl: "https://api.opticodds.com/api/v3",
        authType: "header",
        authKey: "X-Api-Key",
        envVar: "OPTIC_ODDS_API_KEY",
      },
    });
  },
  dispose() {
    bindOpticOddsContext(null);
    disposeConnection?.();
    disposeConnection = null;
  },
};

export default opticOddsPlugin;
