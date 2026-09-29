import { createThrottledFetch } from "gloomberb/utils";
import { httpFetch } from "gloomberb/utils";
import { withConnectionRequest } from "gloomberb/plugins";
import type { NwsCliPrint, NwsCliPrintSet } from "./nws-cli-source";
import { NWS_CLI_USER_AGENT } from "./nws-cli-source";
import { normalizeIcaoStation } from "./nws-cli-source";
import { loadNwsCliPrints } from "./nws-cli-source";
import { findWeatherStation } from "./stations";
import { NWS_CLI_CONNECTION_ID, type WeatherMetric } from "./types";

const NWS_FETCH = createThrottledFetch({
  requestsPerMinute: 20,
  maxRetries: 2,
  timeoutMs: 15_000,
  backoffBaseMs: 400,
  dedupeGetRequests: true,
  defaultHeaders: {
    Accept: "application/json",
    "User-Agent": NWS_CLI_USER_AGENT,
  },
  transport: httpFetch,
});

export function nwsIcaoForStation(token: string): string | null {
  const station = findWeatherStation(token);
  if (station) return station.icao;
  return normalizeIcaoStation(token);
}

export async function fetchNwsCliHistory(stationToken: string, days = 30): Promise<NwsCliPrint[]> {
  const icao = nwsIcaoForStation(stationToken);
  if (!icao) throw new Error("Unknown ICAO station.");
  return withConnectionRequest(NWS_CLI_CONNECTION_ID, "cli-history", async () => {
    const set = await loadNwsCliPrints({
      icao,
      days,
      fetchImpl: ((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        return NWS_FETCH.fetch(url, init);
      }) as typeof fetch,
    });
    return set.prints;
  });
}

export async function loadNwsCliSeries(
  stationToken: string,
  metric: WeatherMetric,
): Promise<{
  points: Array<{ date: Date; value: number }>;
  label: string;
  unit: string;
  unitGroup: string;
}> {
  if (metric === "hourly") {
    throw new Error("NWS CLI is a daily climate print; use WX:{station}:hourly for TWC METAR.");
  }
  const icao = nwsIcaoForStation(stationToken);
  if (!icao) throw new Error("Unknown ICAO station.");
  const station = findWeatherStation(icao);
  const prints = await fetchNwsCliHistory(icao);
  const points = prints.flatMap((print) => {
    const value = metric === "low" ? print.lowF : metric === "precip" ? print.precipIn : print.highF;
    if (value == null) return [];
    const date = new Date(`${print.date}T00:00:00Z`);
    if (!Number.isFinite(date.getTime())) return [];
    return [{ date, value }];
  });
  return {
    points,
    label: `${station?.city ?? icao} NWS ${metric}`,
    unit: metric === "precip" ? "in" : "°F",
    unitGroup: metric === "precip" ? "weather-precip" : "weather-temp",
  };
}
