import type { GloomPlugin } from "gloomberb/types/plugin";
import { WeatherPane } from "./pane";
import { weatherBookCliCommand } from "./cli";
import {
  TWC_KALSHI_URL,
  WEATHER_PANE_ID,
  WEATHER_PLUGIN_ID,
} from "./types";
import { PredictionWeatherSettlementTab } from "./settlement-tab";
import { registerWeatherSources } from "./sources";

let disposeWeatherSources: Array<() => void> = [];

export const weatherPlugin: GloomPlugin = {
  id: WEATHER_PLUGIN_ID,
  name: "Weather",
  version: "1.0.0",
  description:
    "Browse settlement-aware weather observations. Chart TWC with G WX:LAX:high and NWS first-final CLI with G NWS:KNYC:high.",
  toggleable: true,
  targets: ["cli", "tui", "desktop"],
  homepage: "https://github.com/Lucas-Kohorst/gloomberb-plugins",
  cliCommands: [weatherBookCliCommand],

  panes: [
    {
      id: WEATHER_PANE_ID,
      name: "Weather",
      icon: "W",
      component: WeatherPane,
      defaultPosition: "right",
      defaultMode: "floating",
      defaultFloatingSize: { width: 72, height: 28 },
    },
  ],

  paneTemplates: [
    {
      id: "weather-pane",
      paneId: WEATHER_PANE_ID,
      label: "Weather",
      description:
        "Browse settlement-aware weather observations. Chart TWC with G WX:LAX:high and NWS first-final CLI with G NWS:KNYC:high.",
      keywords: [
        "weather",
        "climate",
        "temperature",
        "temp",
        "kalshi",
        "twc",
        "settlement",
        "high",
        "nws",
        "cli",
        "icao",
        "forecast",
      ],
      category: "Data",
      shortcut: { prefix: "WX" },
      createInstance: () => ({ placement: "floating" }),
    },
  ],

  setup(ctx) {
    disposeWeatherSources = registerWeatherSources(ctx);
  },

  dispose() {
    for (const dispose of disposeWeatherSources.splice(0)) dispose();
  },
};

export default weatherPlugin;

export { TWC_KALSHI_URL, PredictionWeatherSettlementTab };
