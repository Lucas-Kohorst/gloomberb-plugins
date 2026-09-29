import type { GloomPlugin } from "gloomberb/types/plugin";
import {
  attachPredictionMarketsPersistence,
  resetPredictionMarketsPersistence,
} from "./services/fetch";
import { predictionChartSeriesCapability } from "./capability";

export const predictionMarketsBackendPlugin: GloomPlugin = {
  id: "prediction-markets",
  name: "Prediction Markets",
  version: "1.0.0",
  description: "Browse prediction markets (Polymarket and Kalshi).",
  toggleable: true,
  setup(ctx) {
    attachPredictionMarketsPersistence(ctx.persistence);
    ctx.registerCapability(predictionChartSeriesCapability);
  },
  dispose() {
    resetPredictionMarketsPersistence();
  },
};
