import { pollRaceKey } from "./normalize";
import type { PollRow } from "./types";

// ---------------------------------------------------------------------------
// Inlined types — these were imported from internal modules that external
// plugins cannot access. The overlay is a "nice to have"; the plugin works
// without it. When no custom loaders are provided, loadPollRaceMarketOverlay
// returns null.
// ---------------------------------------------------------------------------

interface PricePoint {
  date: Date;
  close: number;
}

/** Simplified AdjacentMarket — only the fields the overlay matching uses. */
interface AdjacentMarket {
  id: string;
  platform: "kalshi" | "polymarket";
  title: string;
  subtitle?: string;
  slug?: string;
  status: string;
  yes_price: number | null;
  no_price: number | null;
  event_title?: string;
}

/** Simplified PredictionMarketSearchHit. */
interface PredictionMarketSearchHit {
  venue: "kalshi" | "polymarket";
  marketId: string;
  title: string;
  eventLabel?: string;
  marketLabel?: string;
  url?: string;
}

const POLL_TYPE_MARKET_TERMS: Record<string, string> = {
  governor: "governor",
  "us-senator": "senate",
  "us-representative": "house",
  "generic-ballot": "generic ballot",
  approval: "approval",
  favorability: "favorability",
};

const STOP_WORDS = new Set([
  "the", "and", "for", "of", "in", "to", "a", "on", "at", "by", "or",
  "poll", "polling", "yes", "no", "will", "win",
]);

export interface PollRaceMarketOverlay {
  marketId: string;
  venue: "kalshi" | "polymarket";
  label: string;
  points: PricePoint[];
}

export function pollRaceMarketQuery(
  row: Pick<PollRow, "subject" | "seatName" | "pollType">,
  choice?: string | null,
): string {
  const race = pollRaceKey(row);
  const office = POLL_TYPE_MARKET_TERMS[row.pollType];
  const parts = [race];
  if (office && !race.toLowerCase().includes(office)) parts.push(office);
  if (choice?.trim()) parts.push(choice.trim());
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** State/race label after stripping the year and party primary suffix. */
export function pollRaceGeography(row: Pick<PollRow, "subject" | "seatName">): string | null {
  const race = pollRaceKey(row).replace(/^\d{4}\s+/, "").trim().toLowerCase();
  const geo = race.replace(/\s+(democratic|republican|gop|primary)\b.*$/i, "").trim();
  return geo.length >= 4 ? geo : null;
}

export function tokenizePollMarketQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function marketHaystack(market: AdjacentMarket | PredictionMarketSearchHit): string {
  if ("platform" in market || "event_title" in market) {
    const adjacent = market as AdjacentMarket;
    return `${adjacent.title} ${adjacent.event_title ?? ""} ${adjacent.subtitle ?? ""}`.toLowerCase();
  }
  const hit = market as PredictionMarketSearchHit;
  return `${hit.title} ${hit.eventLabel ?? ""} ${hit.marketLabel ?? ""}`.toLowerCase();
}

export function scoreAdjacentMarketForPoll(
  market: AdjacentMarket | PredictionMarketSearchHit,
  query: string,
  geography: string | null,
): number {
  const haystack = marketHaystack(market);
  if (geography && !haystack.includes(geography)) return 0;
  const tokens = tokenizePollMarketQuery(query);
  if (tokens.length === 0) return 0;
  let score = 0;
  let nonYearHits = 0;
  for (const token of tokens) {
    if (!haystack.includes(token)) continue;
    const yearToken = /^\d{4}$/.test(token);
    score += yearToken ? 1 : token.length >= 4 ? 3 : 2;
    if (!yearToken) nonYearHits += 1;
  }
  if (nonYearHits === 0) return 0;
  return score;
}

export function pickAdjacentMarketForPoll(
  markets: readonly AdjacentMarket[],
  query: string,
  geography: string | null,
): AdjacentMarket | null {
  let best: AdjacentMarket | null = null;
  let bestScore = 0;
  for (const market of markets) {
    const score = scoreAdjacentMarketForPoll(market, query, geography);
    if (score > bestScore) {
      best = market;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

/**
 * Inlined simplified version of venueChartHitFromAdjacentMarket — extracts
 * venue and marketId from an AdjacentMarket's platform/slug fields.
 */
function venueHitFromMarket(market: AdjacentMarket): PredictionMarketSearchHit | null {
  if (market.platform !== "kalshi" && market.platform !== "polymarket") return null;
  const marketId = market.platform === "kalshi"
    ? (market.slug?.trim() || market.id)
    : market.id;
  if (!marketId) return null;
  return {
    venue: market.platform,
    marketId,
    title: market.title,
    ...(market.subtitle ? { eventLabel: market.subtitle } : {}),
  };
}

const overlayCache = new Map<string, PollRaceMarketOverlay | null>();
const overlayInFlight = new Map<string, Promise<PollRaceMarketOverlay | null>>();

export interface PollRaceMarketLoaders {
  search: (query: string) => Promise<readonly AdjacentMarket[]>;
  series: (
    venue: "kalshi" | "polymarket",
    marketId: string,
  ) => Promise<{ label: string; points: PricePoint[] } | null>;
}

export async function loadPollRaceMarketOverlay(
  row: Pick<PollRow, "subject" | "seatName" | "pollType">,
  choice: string | null,
  load?: PollRaceMarketLoaders,
): Promise<PollRaceMarketOverlay | null> {
  if (!load) return null;
  const query = pollRaceMarketQuery(row, choice);
  const geography = pollRaceGeography(row);
  const cacheKey = `${query}|${geography ?? ""}`.toLowerCase();
  if (!cacheKey.trim()) return null;
  if (overlayCache.has(cacheKey)) return overlayCache.get(cacheKey) ?? null;
  const pending = overlayInFlight.get(cacheKey);
  if (pending) return pending;

  const lookup = (async () => {
    const markets = await load.search(query);
    const ranked = [...markets]
      .map((market) => ({ market, score: scoreAdjacentMarketForPoll(market, query, geography) }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score);
    for (const { market } of ranked) {
      const hit = venueHitFromMarket(market);
      if (!hit) continue;
      const series = await load.series(hit.venue, hit.marketId).catch(() => null);
      if (!series || series.points.length === 0) continue;
      const overlay: PollRaceMarketOverlay = {
        marketId: hit.marketId,
        venue: hit.venue,
        label: `${hit.venue === "kalshi" ? "KALSHI" : "POLY"} ${series.label}`,
        points: series.points,
      };
      overlayCache.set(cacheKey, overlay);
      return overlay;
    }
    overlayCache.set(cacheKey, null);
    return null;
  })().finally(() => {
    overlayInFlight.delete(cacheKey);
  });

  overlayInFlight.set(cacheKey, lookup);
  return lookup;
}

export function resetPollRaceMarketOverlayCache(): void {
  overlayCache.clear();
  overlayInFlight.clear();
}
