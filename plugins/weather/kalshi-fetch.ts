/**
 * Kalshi HTTP helpers inlined from the first-party
 * `src/plugins/prediction-markets/services/fetch` module (the `fetchJson`
 * wrapper and `parseFloatSafe`), plus the Kalshi status helper from
 * `services/kalshi/normalize`. The plugin is TUI/desktop only, so requests go
 * straight to the public Kalshi API and through the shared throttled transport.
 */

import { createThrottledFetch, httpFetch } from "gloomberb/utils";
import { withConnectionRequest } from "gloomberb/plugins";
import { WEATHER_CONNECTION_ID } from "./types";

const KALSHI_FETCH = createThrottledFetch({
  requestsPerMinute: 120,
  maxRetries: 2,
  timeoutMs: 12_000,
  backoffBaseMs: 750,
  dedupeGetRequests: false,
  defaultHeaders: {
    Accept: "application/json",
    "User-Agent": "gloomberb-weather",
  },
  transport: httpFetch,
});

/** Inlined prediction-markets `fetchJson`: a throttled JSON GET wrapper. */
export async function fetchJson<T>(url: string, operation = "kalshi"): Promise<T> {
  return withConnectionRequest(WEATHER_CONNECTION_ID, operation, async () => {
    const response = await KALSHI_FETCH.fetch(url);
    if (!response.ok) {
      throw new Error(`Request failed (${response.status}) for ${url}`);
    }
    return response.json() as Promise<T>;
  });
}

export function parseFloatSafe(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Inlined `isOpenKalshiStatus` from prediction-markets Kalshi normalize. */
export function isOpenKalshiStatus(status: string | null | undefined): boolean {
  const normalized = status?.trim().toLowerCase();
  return normalized === "open" || normalized === "active";
}
