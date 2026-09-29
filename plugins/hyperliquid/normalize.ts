import type { Quote, PricePoint } from "gloomberb/types/financials";
import type { InstrumentSearchResult } from "gloomberb/types/instrument";
import type {
  AssetContext,
  PerpMeta,
  SpotMeta,
  Market,
  Candle,
  Trade,
  PerpDex,
  OutcomeMeta,
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
  markets.push(...normalizePerps(perps, spots[0]));
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
      operator: "",
      operatorName: "Hyperliquid",
      deployer: null,
      currency: quote.name === "USDC" ? "USD" : quote.name,
      leverage: 1,
      ...context(c),
    });
  });
  return markets;
}
export function normalizePerps(
  perps: [PerpMeta, AssetContext[]],
  spots: SpotMeta,
  dex?: PerpDex,
): Market[] {
  const collateral = spots.tokens.find(
    (t) => t.index === (perps[0].collateralToken ?? 0),
  )?.name;
  const currency =
    collateral === "USDC"
      ? "USD"
      : (collateral ??
        (dex ? `token:${perps[0].collateralToken ?? 0}` : "USD"));
  return perps[0].universe.flatMap((asset, i) => {
    const c = perps[1][i];
    if (!c || asset.isDelisted) return [];
    return [
      {
        coin: asset.name,
        name: asset.name,
        kind: dex ? "hip3" : "perp",
        currency,
        operator: dex?.name ?? "",
        operatorName: dex?.fullName ?? "Hyperliquid",
        deployer: dex?.deployer ?? null,
        leverage: asset.maxLeverage,
        ...context(c),
      },
    ];
  });
}
function outcomeTitle(name: string, description: string, id: number): string {
  if (
    !name.startsWith("template:") &&
    name !== "Recurring" &&
    name !== "template fallback"
  )
    return name;
  const fields = new Map(
    description.split("|").map((part) => {
      const split = part.indexOf(":");
      return [part.slice(0, split).trim(), part.slice(split + 1).trim()];
    }),
  );
  const asset = fields.get("perp") ?? fields.get("underlying");
  const subject =
    fields.get("participant") ??
    [fields.get("participantA"), fields.get("participantB")]
      .filter(Boolean)
      .join(" vs ");
  const target =
    fields.get("target") ??
    fields.get("threshold") ??
    fields.get("targetPrice");
  const expiry = fields.get("time") ?? fields.get("expiry");
  if (asset)
    return [
      asset,
      target
        ? `${name.includes("Touch") ? "touches" : "threshold"} ${target}`
        : name.replace(/^template:/, ""),
      expiry,
    ]
      .filter(Boolean)
      .join(" · ");
  return (
    [
      fields.get("competition") ?? fields.get("decisionLabel"),
      subject || fields.get("change") || name.replace(/^template:/, ""),
      fields.get("season"),
    ]
      .filter(Boolean)
      .join(" · ") || `Outcome ${id}`
  );
}
export function normalizeOutcomes(
  meta: OutcomeMeta,
  contexts: AssetContext[],
): Market[] {
  const prices = new Map(contexts.map((c) => [c.coin, c]));
  const operators = new Map(meta.deployers?.map((d) => [d.venue, d.deployer]));
  const questions = new Map(
    (meta.questions ?? []).flatMap((q) =>
      [q.fallbackOutcome, ...q.namedOutcomes].map((id) => [id, q] as const),
    ),
  );
  return meta.outcomes.flatMap((outcome) => {
    const question = questions.get(outcome.outcome);
    const description = [question?.description, outcome.description]
      .filter(Boolean)
      .join(" | ");
    const title = outcomeTitle(outcome.name, description, outcome.outcome);
    return outcome.sideSpecs.slice(0, 2).map((side, index) => {
      const coin = `#${10 * outcome.outcome + index}`;
      const c = prices.get(coin);
      return {
        coin,
        name: `${title} · ${side.name.replace(/^template:/, "")}`,
        description,
        kind: "hip4" as const,
        operator: outcome.venue ?? "",
        operatorName: outcome.venue ?? "Hyperliquid",
        deployer: operators.get(outcome.venue ?? "") ?? null,
        currency:
          outcome.quoteToken === "USDC" ? "USD" : (outcome.quoteToken ?? "USD"),
        leverage: 1,
        ...(c
          ? context(c)
          : {
              price: null,
              previous: null,
              volume: null,
              baseVolume: null,
              funding: null,
              openInterest: null,
              mark: null,
            }),
      };
    });
  });
}
export function matchesMarket(m: Market, query: string): boolean {
  const q = query.trim().replace(/^HL:/i, "").toLowerCase();
  if (q.startsWith("operator:")) return m.operator.toLowerCase() === q.slice(9);
  return (
    !q ||
    [
      m.coin,
      m.name,
      m.operator,
      m.operatorName,
      m.deployer,
      m.description,
    ].some((v) => v?.toLowerCase().includes(q))
  );
}
export function marketDex(m: Market): string {
  return m.kind === "hip3" ? m.operator : "";
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
    stale: m.status === "stale",
    dataSource: live ? "live" : "snapshot",
    delivery: live ? "stream" : "poll",
  };
}
export function searchResult(m: Market): InstrumentSearchResult {
  return {
    providerId: "hyperliquid",
    symbol: `HL:${m.coin}`,
    name: `${m.name} ${m.kind === "hip4" ? "Outcome" : m.kind === "spot" ? "Spot" : "Perpetual"} · ${m.operatorName}`,
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
