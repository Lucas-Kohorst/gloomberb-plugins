import type { TickerRecord } from "gloomberb/types/ticker";
import { slimPredictionCatalogSummary } from "./cache";
import { extractPolymarketSlug } from "./services/polymarket/normalize";
import type { PredictionMarketSummary, PredictionVenue } from "./types";

export const DEFAULT_WATCHLIST_ID = "watchlist";

export function predictionCollectionSymbol(
  summary: Pick<PredictionMarketSummary, "venue" | "marketId" | "url">,
): string {
  if (summary.venue === "kalshi") return `KALSHI:${summary.marketId}`;
  const slug = extractPolymarketSlug(summary.url);
  return `POLY:${slug ?? summary.marketId}`;
}

export function resolveDefaultWatchlistId(config: { watchlists: Array<{ id: string }> }): string | null {
  return config.watchlists.find((watchlist) => watchlist.id === DEFAULT_WATCHLIST_ID)?.id
    ?? config.watchlists[0]?.id
    ?? null;
}

export function predictionTickerRecord(
  summary: Pick<PredictionMarketSummary, "venue" | "marketId" | "title" | "url" | "key" | "eventId" | "eventTicker">,
  existing?: TickerRecord | null,
): TickerRecord {
  const symbol = predictionCollectionSymbol(summary);
  const custom = {
    ...(existing?.metadata.custom ?? {}),
    predictionMarketKey: summary.key,
    predictionVenue: summary.venue,
    predictionMarketId: summary.marketId,
    ...(summary.eventId ? { predictionEventId: summary.eventId } : {}),
    ...(summary.eventTicker ? { predictionEventTicker: summary.eventTicker } : {}),
  };
  if (existing) {
    return {
      ...existing,
      metadata: {
        ...existing.metadata,
        name: summary.title || existing.metadata.name,
        custom,
      },
    };
  }
  return {
    metadata: {
      ticker: symbol,
      exchange: summary.venue === "kalshi" ? "KALSHI" : "POLYMARKET",
      currency: "USD",
      name: summary.title || symbol,
      assetCategory: summary.venue === "kalshi" ? "KALSHI" : "POLYMARKET",
      portfolios: [],
      watchlists: [],
      positions: [],
      custom,
      tags: ["prediction"],
    },
  };
}

export function upsertPredictionWatchlistTicker(
  summary: PredictionMarketSummary,
  existing: TickerRecord | null,
  watchlistId: string,
  starred: boolean,
): TickerRecord {
  const ticker = predictionTickerRecord(summary, existing);
  const watchlists = ticker.metadata.watchlists.filter((id) => id !== watchlistId);
  if (starred) watchlists.push(watchlistId);
  return {
    ...ticker,
    metadata: { ...ticker.metadata, watchlists },
  };
}

export function applyPredictionStarMemberships(
  summaries: PredictionMarketSummary[],
  tickers: ReadonlyMap<string, TickerRecord>,
  watchlistId: string,
  starred: boolean,
): TickerRecord[] {
  return summaries.map((summary) => (
    upsertPredictionWatchlistTicker(
      summary,
      tickers.get(predictionCollectionSymbol(summary)) ?? null,
      watchlistId,
      starred,
    )
  ));
}

/**
 * External plugins cannot write the host's ticker repository directly. The
 * pane keeps its own persisted plugin state; this helper remains as a small
 * compatibility shim for callers that also want the generated ticker records.
 */
export async function persistPredictionStarsToDefaultWatchlist({
  summaries,
  starred,
  tickers,
}: {
  summaries: PredictionMarketSummary[];
  starred: boolean;
  config?: unknown;
  tickers: ReadonlyMap<string, TickerRecord>;
  dispatch?: (action: any) => void;
}): Promise<TickerRecord[]> {
  return applyPredictionStarMemberships(summaries, tickers, DEFAULT_WATCHLIST_ID, starred);
}

export function applyWatchlistSnapshots(
  current: PredictionMarketSummary[],
  summaries: PredictionMarketSummary[],
  starred: boolean,
): PredictionMarketSummary[] {
  if (summaries.length === 0) return current;
  if (!starred) {
    const removed = new Set(summaries.map((summary) => summary.key));
    return current.filter((snapshot) => !removed.has(snapshot.key));
  }
  const next = [...current];
  const indexByKey = new Map(next.map((snapshot, index) => [snapshot.key, index]));
  for (const summary of summaries) {
    const slim = slimPredictionCatalogSummary(summary);
    const existingIndex = indexByKey.get(summary.key);
    if (existingIndex == null) {
      indexByKey.set(summary.key, next.length);
      next.push(slim);
    } else {
      next[existingIndex] = slim;
    }
  }
  return next;
}

function createStubSummary({
  key,
  venue,
  marketId,
  title,
  eventTicker,
}: {
  key: string;
  venue: PredictionVenue;
  marketId: string;
  title: string;
  eventTicker?: string;
}): PredictionMarketSummary {
  return {
    key,
    venue,
    marketId,
    ...(eventTicker ? { eventTicker } : {}),
    title,
    marketLabel: title,
    eventLabel: title,
    status: "open",
    url: venue === "kalshi"
      ? `https://kalshi.com/markets/${marketId}`
      : `https://polymarket.com/event/${marketId}`,
    description: "",
    endsAt: null,
    updatedAt: null,
    createdAt: null,
    yesPrice: null,
    noPrice: null,
    yesBid: null,
    yesAsk: null,
    noBid: null,
    noAsk: null,
    spread: null,
    lastTradePrice: null,
    volume24h: null,
    volume24hUnit: "usd",
    totalVolume: null,
    totalVolumeUnit: "usd",
    openInterest: null,
    openInterestUnit: "usd",
    liquidity: null,
    liquidityUnit: "usd",
  };
}

export function stubSummaryFromWatchlistKey(key: string): PredictionMarketSummary | null {
  const separator = key.indexOf(":");
  if (separator <= 0) return null;
  const venue = key.slice(0, separator);
  const marketId = key.slice(separator + 1);
  if ((venue !== "kalshi" && venue !== "polymarket") || !marketId) return null;
  return createStubSummary({ key, venue, marketId, title: marketId });
}

export function stubSummaryFromTicker(ticker: TickerRecord): PredictionMarketSummary | null {
  const custom = ticker.metadata.custom;
  const customKey = typeof custom.predictionMarketKey === "string" ? custom.predictionMarketKey : "";
  const customMarketId = typeof custom.predictionMarketId === "string" ? custom.predictionMarketId : "";
  const customEventTicker = typeof custom.predictionEventTicker === "string" ? custom.predictionEventTicker : "";
  const fromKey = customKey ? stubSummaryFromWatchlistKey(customKey) : null;
  let venue: PredictionVenue | null =
    custom.predictionVenue === "kalshi" || custom.predictionVenue === "polymarket"
      ? custom.predictionVenue
      : (fromKey?.venue ?? null);
  let marketId = customMarketId || fromKey?.marketId || "";
  let key = customKey;

  if (!venue || !marketId) {
    const separator = ticker.metadata.ticker.indexOf(":");
    if (separator > 0) {
      const prefix = ticker.metadata.ticker.slice(0, separator);
      const rest = ticker.metadata.ticker.slice(separator + 1);
      if (prefix === "KALSHI" && rest) {
        venue = venue ?? "kalshi";
        marketId = marketId || rest;
      } else if (prefix === "POLY" && rest) {
        venue = venue ?? "polymarket";
        marketId = marketId || rest;
      }
    }
  }
  if (!key && venue && marketId) key = `${venue}:${marketId}`;
  if (!venue || !key || !marketId) return null;
  return createStubSummary({
    key,
    venue,
    marketId,
    title: ticker.metadata.name.trim() || marketId,
    ...(customEventTicker ? { eventTicker: customEventTicker } : {}),
  });
}

export function isPredictionMarketTicker(ticker: TickerRecord): boolean {
  const category = ticker.metadata.assetCategory;
  return category === "POLYMARKET" || category === "KALSHI" || stubSummaryFromTicker(ticker) != null;
}

export function hydrateWatchlistSnapshots(
  current: PredictionMarketSummary[],
  watchlistKeys: Iterable<string>,
  tickers: ReadonlyMap<string, TickerRecord>,
): PredictionMarketSummary[] {
  const present = new Set(current.map((snapshot) => snapshot.key));
  const tickerByMarketKey = new Map<string, TickerRecord>();
  for (const ticker of tickers.values()) {
    const customKey = ticker.metadata.custom.predictionMarketKey;
    if (typeof customKey === "string" && customKey) tickerByMarketKey.set(customKey, ticker);
  }
  const next = [...current];
  for (const key of watchlistKeys) {
    if (present.has(key)) continue;
    const ticker = tickerByMarketKey.get(key);
    const stub = (ticker ? stubSummaryFromTicker(ticker) : null) ?? stubSummaryFromWatchlistKey(key);
    if (stub) next.push(stub);
  }
  return next;
}

export function resolveWatchlistMarkets(
  liveCatalog: PredictionMarketSummary[],
  snapshots: PredictionMarketSummary[],
  watchlist: Set<string>,
): PredictionMarketSummary[] {
  if (watchlist.size === 0) return [];
  const liveByKey = new Map(liveCatalog.map((market) => [market.key, market]));
  const snapshotByKey = new Map(snapshots.map((market) => [market.key, market]));
  return [...watchlist].flatMap((key) => {
    const market = liveByKey.get(key) ?? snapshotByKey.get(key) ?? stubSummaryFromWatchlistKey(key);
    return market ? [market] : [];
  });
}
