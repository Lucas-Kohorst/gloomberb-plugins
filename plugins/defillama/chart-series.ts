import { colors } from "gloomberb/theme";
import type { ResolvedSeries } from "gloomberb/capabilities";
import { httpFetch } from "gloomberb/utils";
import { withConnectionRequest } from "gloomberb/plugins";
import { parseDefiLlamaSeriesId, defillamaSeriesLabel, type DefiLlamaSeriesIdentity } from "./catalog";

// ---------------------------------------------------------------------------
// DefiLlama API client (inlined — no internal source module dependency)
// ---------------------------------------------------------------------------

type DefiLlamaKind = "chain" | "protocol";
type DefiLlamaMetric = "tvl" | "fees" | "revenue";

interface CacheEntry {
  loadedAt: number;
  points: Array<{ date: Date; observedAt: Date; value: number; provenance: { providerId: string; quality: string } }>;
  label: string;
}

const API_BASE_URL = "https://api.llama.fi";
const CACHE_TTL_MS = 5 * 60_000;
const MAX_CACHE_ENTRIES = 32;
const REQUEST_TIMEOUT_MS = 20_000;
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<{ points: CacheEntry["points"]; label: string }>>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNonnegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function normalizeDailyPoints(rows: Iterable<readonly [unknown, unknown]>): CacheEntry["points"] {
  const byDay = new Map<number, { timestamp: number; value: number }>();
  for (const [rawTimestamp, rawValue] of rows) {
    const timestamp = finiteNonnegative(rawTimestamp);
    const value = finiteNonnegative(rawValue);
    if (timestamp === null || value === null) continue;
    const observed = new Date(timestamp * 1_000);
    if (!Number.isFinite(observed.getTime())) continue;
    const day = Date.UTC(observed.getUTCFullYear(), observed.getUTCMonth(), observed.getUTCDate());
    const previous = byDay.get(day);
    if (!previous || timestamp >= previous.timestamp) byDay.set(day, { timestamp, value });
  }
  return [...byDay.entries()]
    .sort(([left], [right]) => left - right)
    .map(([day, { value }]) => {
      const date = new Date(day);
      return {
        date,
        observedAt: date,
        value,
        provenance: { providerId: "defillama", quality: "reported" as const },
      };
    });
}

function fallbackName(slug: string): string {
  return slug.split("-").filter(Boolean).map((part) => (
    part.charAt(0).toUpperCase() + part.slice(1)
  )).join(" ");
}

function metricLabel(metric: DefiLlamaMetric): string {
  return metric === "tvl" ? "TVL" : `daily ${metric}`;
}

function endpoint(kind: DefiLlamaKind, slug: string, metric: DefiLlamaMetric): string {
  const encodedSlug = encodeURIComponent(slug);
  if (kind === "chain") return `${API_BASE_URL}/v2/historicalChainTvl/${encodedSlug}`;
  if (metric === "tvl") return `${API_BASE_URL}/protocol/${encodedSlug}`;
  const dataType = metric === "fees" ? "dailyFees" : "dailyRevenue";
  return `${API_BASE_URL}/summary/fees/${encodedSlug}?dataType=${dataType}`;
}

function payloadName(payload: Record<string, unknown>, slug: string): string {
  for (const field of [payload.displayName, payload.name]) {
    if (typeof field === "string" && field.trim()) return field.trim();
  }
  return fallbackName(slug);
}

async function fetchSeries(
  kind: DefiLlamaKind,
  slug: string,
  metric: DefiLlamaMetric,
): Promise<{ points: CacheEntry["points"]; label: string }> {
  const operation = `${kind}-${metric}`;
  return withConnectionRequest("defillama", operation, async () => {
    const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const response = await httpFetch(endpoint(kind, slug, metric), {
      headers: { Accept: "application/json" },
      signal,
    });
    if (!response.ok) {
      throw new Error(`DefiLlama ${operation} request failed (${response.status}) for "${slug}".`);
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      signal.throwIfAborted();
      throw new Error(`DefiLlama ${operation} returned invalid JSON for "${slug}".`);
    }

    let rows: Iterable<readonly [unknown, unknown]>;
    let name: string;

    if (kind === "chain") {
      rows = Array.isArray(payload)
        ? payload.map((entry) => (isRecord(entry) ? [entry.date, entry.tvl] as [unknown, unknown] : [undefined, undefined]))
        : [];
      name = fallbackName(slug);
    } else if (!isRecord(payload)) {
      rows = [];
      name = fallbackName(slug);
    } else if (metric === "tvl") {
      rows = Array.isArray(payload.tvl)
        ? payload.tvl.map((entry) => (isRecord(entry) ? [entry.date, entry.totalLiquidityUSD] as [unknown, unknown] : [undefined, undefined]))
        : [];
      name = payloadName(payload, slug);
    } else {
      rows = Array.isArray(payload.totalDataChart)
        ? payload.totalDataChart.map((entry) => (Array.isArray(entry) ? [entry[0], entry[1]] as [unknown, unknown] : [undefined, undefined]))
        : [];
      name = payloadName(payload, slug);
    }

    const points = normalizeDailyPoints(rows);
    if (points.length === 0) {
      throw new Error(`DefiLlama returned no valid ${metric} history for "${name}".`);
    }
    return { points, label: `${name} ${metricLabel(metric)} (USD)` };
  });
}

function readCache(key: string): CacheEntry | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.loadedAt >= CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, entry);
  return entry;
}

function writeCache(key: string, value: CacheEntry): void {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

async function loadDefiLlamaSeries(
  identity: DefiLlamaSeriesIdentity,
): Promise<{ points: CacheEntry["points"]; label: string }> {
  const normalizedSlug = identity.slug.trim().toLowerCase();
  if (!normalizedSlug) throw new Error("DefiLlama requires a chain or protocol slug.");
  if (identity.kind === "chain" && identity.metric !== "tvl") {
    throw new Error("DefiLlama chain series only support TVL.");
  }
  const key = `${identity.kind}:${normalizedSlug}:${identity.metric}`;
  const cached = readCache(key);
  if (cached) return { points: cached.points, label: cached.label };
  const pending = inflight.get(key);
  if (pending) return pending;
  const request = fetchSeries(identity.kind, normalizedSlug, identity.metric)
    .then((value) => {
      writeCache(key, { loadedAt: Date.now(), points: value.points, label: value.label });
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, request);
  return request;
}

// ---------------------------------------------------------------------------
// Chart series resolver
// ---------------------------------------------------------------------------

export async function resolveDefiLlamaChartSeries(seriesId: string): Promise<ResolvedSeries> {
  const identity = parseDefiLlamaSeriesId(seriesId);
  if (!identity) throw new Error("Use LLAMA:chain:ethereum:tvl or LLAMA:protocol:aave:tvl (protocols also support fees/revenue).");
  const data = await loadDefiLlamaSeries(identity);
  return {
    id: `defillama:${seriesId}`,
    label: data.label ?? defillamaSeriesLabel(identity),
    color: colors.textBright,
    unit: "USD",
    unitGroup: "currency-total:USD",
    nativeFrequency: "daily",
    dataShape: "scalar",
    style: "line",
    transform: "raw",
    axis: "left",
    panelId: "main",
    interpolation: "none",
    points: data.points,
  } as ResolvedSeries;
}
