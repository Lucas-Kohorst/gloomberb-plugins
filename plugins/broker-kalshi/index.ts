import type { BrokerAdapter } from "gloomberb/types/broker";
import type { BrokerInstanceConfig } from "gloomberb/types/config";
import type { GloomPlugin, GloomPluginContext } from "gloomberb/types/plugin";
import { createConnection, withConnectionRequest } from "gloomberb/plugins";
import { loadKalshiPortfolio } from "./client";
import type { BrokerPortfolioSnapshot } from "./normalize";

const CONNECTION_ID = "kalshi-broker";
const PRESERVED_PASSWORD_HINT = "Saved; leave blank to keep";
const PREDICTION_MARKETS_PANE_ID = "prediction-markets";
const PREDICTION_MARKETS_MAIN = "prediction-markets:main";

let pluginCtx: GloomPluginContext | null = null;
let disposeKalshiConnection: (() => void) | null = null;

function configText(instance: BrokerInstanceConfig, key: string): string {
  const value = instance.config[key];
  return typeof value === "string" ? value.trim() : "";
}

function openInPredictionMarkets(ticker: string): void {
  const ctx = pluginCtx;
  const symbol = ticker.trim();
  if (!ctx || !symbol) return;
  if (!ctx.getPaneDef(PREDICTION_MARKETS_PANE_ID)) {
    ctx.notify({
      body: "Prediction Markets is not available. Enable the Prediction Markets plugin.",
      type: "error",
    });
    return;
  }
  ctx.resume.setPaneState(PREDICTION_MARKETS_MAIN, "searchQuery", symbol);
  ctx.resume.setPaneState(PREDICTION_MARKETS_MAIN, "venueScope", "kalshi");
  ctx.resume.setPaneState(PREDICTION_MARKETS_MAIN, "selectedMarketKey", null);
  ctx.focusPane(PREDICTION_MARKETS_PANE_ID);
}

async function loadPortfolio(instance: BrokerInstanceConfig): Promise<BrokerPortfolioSnapshot> {
  return withConnectionRequest(CONNECTION_ID, "sync-portfolio", () => loadKalshiPortfolio({
    keyId: configText(instance, "keyId"),
    privateKey: String(instance.config.privateKey ?? ""),
    environment: configText(instance, "environment") || "production",
  }));
}

export const kalshiBroker: BrokerAdapter = {
  id: "kalshi",
  name: "Kalshi",
  configSchema: [
    {
      key: "keyId",
      label: "Key ID",
      type: "text",
      required: true,
      placeholder: "Kalshi API Key ID",
    },
    {
      key: "privateKey",
      label: "Private Key",
      type: "password",
      required: true,
      placeholder: "PEM private key",
    },
    {
      key: "environment",
      label: "Environment",
      type: "select",
      required: true,
      defaultValue: "production",
      options: [
        { label: "Production", value: "production" },
        { label: "Demo", value: "demo" },
      ],
    },
  ],

  async validate(instance) {
    return configText(instance, "keyId").length > 0 && configText(instance, "privateKey").length > 0;
  },

  async importPositions(instance) {
    return (await loadPortfolio(instance)).positions;
  },

  async importPortfolioSnapshot(instance) {
    return loadPortfolio(instance);
  },

  async listAccounts(instance) {
    return (await loadPortfolio(instance)).accounts;
  },

  getProfileActions(_instance) {
    return [{
      id: "kalshi-open-pm",
      label: "Open in Prediction Markets",
      paneId: "prediction-markets",
    }];
  },

  toConfigValues(instance) {
    return {
      keyId: configText(instance, "keyId"),
      privateKey: configText(instance, "privateKey") ? PRESERVED_PASSWORD_HINT : "",
      environment: configText(instance, "environment") || "production",
    };
  },

  fromConfigValues(values, previous) {
    const privateKey = typeof values.privateKey === "string" ? values.privateKey.trim() : "";
    const previousKey = previous && typeof previous.config.privateKey === "string"
      ? previous.config.privateKey
      : "";
    const keepPrevious = !privateKey || privateKey === PRESERVED_PASSWORD_HINT;
    return {
      keyId: typeof values.keyId === "string" ? values.keyId.trim() : "",
      privateKey: keepPrevious ? previousKey : privateKey,
      environment: values.environment === "demo" ? "demo" : "production",
    };
  },
};

export const kalshiPlugin: GloomPlugin = {
  id: "kalshi",
  name: "Kalshi",
  version: "1.0.0",
  description: "Read-only account and position sync for Kalshi.",
  toggleable: true,
  targets: ["cli", "tui", "desktop"],
  broker: kalshiBroker,
  paneTemplates: [
    {
      id: "kalshi-connect",
      paneId: "brokers",
      label: "Kalshi",
      description: "Sync a read-only Kalshi portfolio into Brokers.",
      keywords: ["kalshi", "event", "contracts", "portfolio"],
      shortcut: { prefix: "KLSH" },
      singleton: true,
      createInstance: () => ({ placement: "floating" }),
    },
  ],
  setup(ctx) {
    pluginCtx = ctx;
    disposeKalshiConnection = createConnection(ctx, {
      id: CONNECTION_ID,
      name: "Kalshi Portfolio",
      kind: "broker",
      authRequired: true,
      priority: 410,
    });
    ctx.registerTickerAction({
      id: "kalshi-open-pm",
      label: "Open in Prediction Markets",
      keywords: ["kalshi", "prediction", "markets", "event"],
      filter: (ticker) => ticker.metadata?.exchange?.toUpperCase() === "KALSHI",
      execute: (ticker) => {
        openInPredictionMarkets(ticker.metadata?.ticker ?? "");
      },
    });
    ctx.registerCommand({
      id: "kalshi-open-pm",
      label: "Open in Prediction Markets",
      description: "Search the ticker on Kalshi in Prediction Markets.",
      keywords: ["kalshi", "prediction", "markets", "event"],
      category: "data",
      shortcutArg: {
        placeholder: "ticker",
        kind: "ticker",
        parse: (arg) => ({ ticker: arg.trim() }),
      },
      execute: async (values) => {
        openInPredictionMarkets(values?.ticker ?? "");
      },
    });
  },
  dispose() {
    disposeKalshiConnection?.();
    disposeKalshiConnection = null;
    pluginCtx = null;
  },
};

export default kalshiPlugin;
