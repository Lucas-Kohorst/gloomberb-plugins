import type { GloomPlugin } from "gloomberb/types/plugin";
import { createChartSource } from "gloomberb/plugins";
import { resolveDefiLlamaChartSeries } from "./chart-series";
import { defillamaSeriesCatalog } from "./catalog";

let unregister: (() => void) | undefined;

export const defillamaPlugin: GloomPlugin = {
  id: "defillama",
  name: "DefiLlama",
  version: "1.0.0",
  description: "DefiLlama TVL, fees, and revenue chart series for the Data Catalog.",
  toggleable: true,
  targets: ["cli", "tui", "desktop"],
  homepage: "https://github.com/Lucas-Kohorst/gloomberb-plugins",

  setup(ctx) {
    unregister?.();
    unregister = createChartSource(ctx, {
      id: "defillama",
      name: "DefiLlama",
      catalog: defillamaSeriesCatalog,
      resolve: (seriesId) => resolveDefiLlamaChartSeries(seriesId),
      connection: { kind: "api", authRequired: false, priority: 300 },
    });
  },

  dispose() {
    unregister?.();
    unregister = undefined;
  },
};

export default defillamaPlugin;
