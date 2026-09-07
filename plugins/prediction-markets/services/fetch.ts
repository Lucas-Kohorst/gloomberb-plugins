import type { PluginPersistence } from "gloomberb/types/plugin";
import { capPredictionCatalogByEvent } from "../cache";
import type { PredictionMarketSummary } from "../types";
import { httpFetch, createThrottledFetch } from "gloomberb/utils";
import { withConnectionRequest } from "gloomberb/plugins";

const DEFAULT_SOURCE_KEY = "remote";
const PREDICTION_FETCH = createThrottledFetch({
  requestsPerMinute: 120,
  maxRetries: 2,
  timeoutMs: 10_000,
  // An upstream 522 comes back fast, so a 250ms base retried both attempts
  // inside 750ms and surfaced an error banner for a blip that was already over
  // a second later. 750ms spreads the three attempts across ~2.2s instead.
  backoffBaseMs: 750,
  dedupeGetRequests: false,
  defaultHeaders: {
    Accept: "application/json",
    "User-Agent": "gloomberb-prediction-markets",
  },
  transport: httpFetch,
});

export const PREDICTION_CACHE_POLICIES = {
  catalog: { staleMs: 5 * 60_000, expireMs: 10 * 60_000 },
  detail: { staleMs: 10_000, expireMs: 5 * 60_000 },
  book: { staleMs: 5_000, expireMs: 30_000 },
  trades: { staleMs: 5_000, expireMs: 2 * 60_000 },
  history: { staleMs: 60_000, expireMs: 24 * 60 * 60_000 },
  rules: { staleMs: 24 * 60 * 60_000, expireMs: 30 * 24 * 60 * 60_000 },
} as const;

let predictionMarketsPersistence: PluginPersistence | null = null;
const predictionResourceInflight = new Map<string, Promise<unknown>>();

function predictionResourceInflightKey(kind: string, key: string, sourceKey: string): string {
  return `${kind}:${key}:${sourceKey}`;
}

export function attachPredictionMarketsPersistence(
  persistence: PluginPersistence,
): void {
  predictionMarketsPersistence = persistence;
  predictionResourceInflight.clear();
}

export function resetPredictionMarketsPersistence(): void {
  predictionMarketsPersistence = null;
  predictionResourceInflight.clear();
}

function connectionIdForPredictionUrl(url: string): string | null {
  if (url.includes("kalshi.com")) return "kalshi";
  if (url.includes("polymarket.com")) return "polymarket";
  return null;
}

export async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const connectionId = connectionIdForPredictionUrl(url);
  const request = async (): Promise<Response> => {
    const response = await PREDICTION_FETCH.fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`Request failed (${response.status}) for ${url}`);
    }
    return response;
  };
  const response = await (connectionId
    ? withConnectionRequest(
      connectionId,
      new URL(url).pathname,
      request,
    )
    : request());
  return response.json() as Promise<T>;
}

export function getCachedPredictionResource<T>(
  kind: string,
  key: string,
  options?: { sourceKey?: string; allowExpired?: boolean },
): T | null {
  const record = predictionMarketsPersistence?.getResource<T>(kind, key, {
    sourceKey: options?.sourceKey ?? DEFAULT_SOURCE_KEY,
    allowExpired: options?.allowExpired,
  });
  return record?.value ?? null;
}

function setCachedPredictionResource<T>(
  kind: string,
  key: string,
  value: T,
  cachePolicy: { staleMs: number; expireMs: number },
  sourceKey = DEFAULT_SOURCE_KEY,
): void {
  const persisted = kind === "catalog" && Array.isArray(value)
    ? capPredictionCatalogByEvent(value as PredictionMarketSummary[])
    : value;
  predictionMarketsPersistence?.setResource(kind, key, persisted, {
    sourceKey,
    cachePolicy,
  });
}

export async function loadCachedPredictionResource<T>(
  kind: string,
  key: string,
  fetcher: () => Promise<T>,
  cachePolicy: { staleMs: number; expireMs: number },
  options?: { force?: boolean },
): Promise<T> {
  const sourceKey = DEFAULT_SOURCE_KEY;
  const inflightKey = predictionResourceInflightKey(kind, key, sourceKey);
  const cached = predictionMarketsPersistence?.getResource<T>(kind, key, {
    sourceKey,
  });
  if (
    !options?.force
    && cached
    && cached.stale !== true
    && cached.staleAt > Date.now()
  ) {
    return cached.value;
  }
  const existing = predictionResourceInflight.get(inflightKey) as Promise<T> | undefined;
  if (existing) return existing;

  const request = (async () => {
    try {
      const nextValue = await fetcher();
      setCachedPredictionResource(kind, key, nextValue, cachePolicy);
      return nextValue;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      if (cached) return cached.value;
      throw error;
    }
  })();
  predictionResourceInflight.set(inflightKey, request);
  try {
    return await request;
  } finally {
    if (predictionResourceInflight.get(inflightKey) === request) {
      predictionResourceInflight.delete(inflightKey);
    }
  }
}

export function parseFloatSafe(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}
