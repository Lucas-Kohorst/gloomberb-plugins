import type { Quote, PricePoint } from "gloomberb/types/financials";
import type { InstrumentSearchResult } from "gloomberb/types/instrument";
import type {
  AssetContext,
  PerpMeta,
  SpotMeta,
  Market,
  Candle,
  Trade,
} from "./types";

export function number(value: unknown): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim()))
    return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
export function coinFromTicker(ticker: string): string | null {
  return /^HL:([^\s]+)$/i.exec(ticker.trim())?.[1] ?? null;
}
export function changePercent(m: Market): number | null {
  return m.price != null && m.previous != null && m.previous > 0
    ? (m.price / m.previous - 1) * 100
    : null;
}
function context(c: AssetContext) {
  return {
    price: number(c.midPx) ?? number(c.markPx),
    previous: number(c.prevDayPx),
    volume: number(c.dayNtlVlm),
    baseVolume: number(c.dayBaseVlm),
    funding: number(c.funding),
    openInterest: number(c.openInterest),
    mark: number(c.markPx),
  };
}
export function normalizeMarkets(
  perps: [PerpMeta, AssetContext[]],
  spots: [SpotMeta, AssetContext[]],
): Market[] {
  const markets: Market[] = [];
  perps[0].universe.forEach((asset, i) => {
    const c = perps[1][i];
    if (!c || asset.isDelisted) return;
    markets.push({
      coin: asset.name,
      name: asset.name,
      kind: "perp",
      currency: "USD",
      leverage: asset.maxLeverage,
      ...context(c),
    });
  });
  const tokens = new Map(spots[0].tokens.map((t) => [t.index, t]));
  const contexts = new Map(spots[1].map((c) => [c.coin, c]));
  spots[0].universe.forEach((pair) => {
    const c = contexts.get(pair.name),
      base = tokens.get(pair.tokens[0]),
      quote = tokens.get(pair.tokens[1]);
    if (!c || !base || !quote) return;
    markets.push({
      coin: pair.index === 0 ? pair.name : `@${pair.index}`,
      name: `${base.name}/${quote.name}`,
      kind: "spot",
      currency: quote.name === "USDC" ? "USD" : quote.name,
      leverage: 1,
      ...context(c),
    });
  });
  return markets;
}
export function quoteFor(m: Market, live = false): Quote {
  if (m.price == null) throw new Error(`No price for ${m.name}`);
  return {
    symbol: `HL:${m.coin}`,
    providerId: "hyperliquid",
    name: m.name,
    price: m.price,
    currency: m.currency,
    change: m.previous == null ? 0 : m.price - m.previous,
    changePercent: changePercent(m) ?? 0,
    previousClose: m.previous ?? undefined,
    volume: m.baseVolume ?? undefined,
    mark: m.mark ?? undefined,
    lastUpdated: Date.now(),
    dataSource: live ? "live" : "snapshot",
    delivery: live ? "stream" : "poll",
  };
}
export function searchResult(m: Market): InstrumentSearchResult {
  return {
    providerId: "hyperliquid",
    symbol: `HL:${m.coin}`,
    name: `${m.name} ${m.kind === "perp" ? "Perpetual" : "Spot"}`,
    exchange: "Hyperliquid",
    type: "CRYPTO",
    currency: m.currency,
  };
}
export function candlePoints(candles: Candle[]): PricePoint[] {
  const unique = new Map<number, PricePoint>();
  for (const c of candles) {
    const open = number(c.o),
      high = number(c.h),
      low = number(c.l),
      close = number(c.c),
      volume = number(c.v);
    if (
      !Number.isFinite(c.t) ||
      open == null ||
      high == null ||
      low == null ||
      close == null ||
      volume == null
    )
      continue;
    unique.set(c.t, { date: new Date(c.t), open, high, low, close, volume });
  }
  return [...unique.values()].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
}
export function mergeTrades(previous: Trade[], incoming: Trade[]): Trade[] {
  const unique = new Map(
    [...previous, ...incoming].map((t) => [`${t.coin}:${t.time}:${t.tid}`, t]),
  );
  return [...unique.values()]
    .sort((a, b) => b.time - a.time || b.tid - a.tid)
    .slice(0, 100);
}
