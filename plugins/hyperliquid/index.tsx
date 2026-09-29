import type { GloomPlugin } from "gloomberb/types/plugin";
import { assetDataProvider } from "gloomberb/capabilities";
import { createConnection } from "gloomberb/plugins";
import { HyperliquidPane } from "./pane";
import { provider } from "./provider";
import { client } from "./client";
let disposers: (() => void)[] = [];
const plugin: GloomPlugin = {
  id: "hyperliquid",
  name: "Hyperliquid",
  version: "1.1.0",
  description:
    "Hyperliquid native, HIP-3 and HIP-4 markets and operators, live books, candles and read-only wallet positions.",
  homepage: "https://github.com/Lucas-Kohorst/gloomberb-plugins",
  toggleable: true,
  targets: ["cli", "tui", "desktop"],
  capabilities: [assetDataProvider(provider)],
  panes: [
    {
      id: "hyperliquid",
      name: "Hyperliquid",
      icon: "H",
      component: HyperliquidPane,
      defaultPosition: "right",
      defaultMode: "floating",
      defaultFloatingSize: { width: 110, height: 34 },
      settings: {
        title: "Hyperliquid settings",
        fields: [
          {
            key: "wallet",
            label: "Public wallet address (read-only)",
            type: "text",
            placeholder: "0x…",
          },
        ],
      },
    },
  ],
  paneTemplates: [
    {
      id: "hyperliquid-pane",
      paneId: "hyperliquid",
      label: "Hyperliquid",
      description:
        "Search Hyperliquid perps, spot, HIP-3 and HIP-4 operators and markets; inspect candles, books, trades and wallet positions.",
      keywords: [
        "hyperliquid",
        "hype",
        "crypto",
        "perps",
        "spot",
        "funding",
        "orderbook",
        "HIP-3",
        "HIP-4",
        "operators",
      ],
      category: "Data",
      shortcut: { prefix: "HL" },
      createInstance: (_ctx, options) => ({
        placement: "floating",
        settings: { query: options?.arg ?? "" },
      }),
    },
  ],
  cliCommands: [
    {
      name: "hyperliquid",
      aliases: ["hl"],
      description: "Hyperliquid market quotes and order books",
      help: {
        usage: ["hyperliquid [coin] [--book]", "hyperliquid --operators"],
      },
      execute: async (args, ctx) => {
        const coin = args
          .find((a) => !a.startsWith("--"))
          ?.replace(/^HL:/i, "");
        if (args.includes("--operators"))
          ctx.printResult({ data: (await client.getCatalog()).operators });
        else if (coin && args.includes("--book"))
          ctx.printResult({ data: await client.book(coin) });
        else if (coin)
          ctx.printResult({ data: await provider.getQuote(`HL:${coin}`) });
        else ctx.printResult({ data: await client.getMarkets() });
      },
    },
  ],
  setup(ctx) {
    disposers = [
      createConnection(ctx, {
        id: "hyperliquid",
        name: "Hyperliquid",
        kind: "api",
        authRequired: false,
      }),
      createConnection(ctx, {
        id: "hyperliquid-ws",
        name: "Hyperliquid live",
        kind: "api",
        authRequired: false,
        isWebSocket: true,
      }),
    ];
  },
  dispose() {
    for (const dispose of disposers) dispose();
    disposers = [];
  },
};
export default plugin;
