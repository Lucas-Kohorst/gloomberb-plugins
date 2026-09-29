import type {
  AssetDataProvider,
  QuoteSubscriptionTarget,
  MarketDataRequestContext,
} from "gloomberb/types/data-provider";
import type { Quote, TickerFinancials } from "gloomberb/types/financials";
import type { TimeRange, ManualChartResolution } from "gloomberb/time-series";
import { client, HyperliquidClient } from "./client";
import {
  candlePoints,
  coinFromTicker,
  number,
  quoteFor,
  searchResult,
} from "./normalize";
import { subscribe } from "./ws";
import type { Market } from "./types";
const DAYS: Record<TimeRange, number> = {
  "1D": 1,
  "1W": 7,
  "1M": 30,
  "3M": 90,
  "6M": 180,
  "1Y": 365,
  "5Y": 1825,
  ALL: 1825,
};
const INTERVAL: Record<TimeRange, string> = {
  "1D": "5m",
  "1W": "1h",
  "1M": "1h",
  "3M": "4h",
  "6M": "1d",
  "1Y": "1d",
  "5Y": "1d",
  ALL: "1d",
};
const MANUAL = {
  "1m": ["1m", 60_000],
  "5m": ["5m", 300_000],
  "15m": ["15m", 900_000],
  "30m": ["30m", 1_800_000],
  "1h": ["1h", 3_600_000],
  "4h": ["4h", 14_400_000],
  "1d": ["1d", 86_400_000],
  "1wk": ["1w", 604_800_000],
  "1mo": ["1M", 2_592_000_000],
} as const;
export class HyperliquidProvider implements AssetDataProvider {
  readonly id = "hyperliquid";
  readonly name = "Hyperliquid";
  readonly priority = 2000;
  constructor(
    private api: HyperliquidClient = client,
    private stream = subscribe,
  ) {}
  canProvide(ticker: string) {
    return coinFromTicker(ticker) !== null;
  }
  private async market(ticker: string, force = false) {
    const coin = coinFromTicker(ticker);
    if (!coin) throw new Error(`Not a Hyperliquid symbol: ${ticker}`);
    const markets = await this.api.getMarkets(force);
    const market = markets.find(
      (m) => m.coin.toLowerCase() === coin.toLowerCase(),
    );
    if (!market) throw new Error(`Unknown Hyperliquid market: ${coin}`);
    return market;
  }
  async getQuote(
    ticker: string,
    _exchange?: string,
    context?: MarketDataRequestContext,
  ): Promise<Quote> {
    const market = await this.market(ticker, context?.cacheMode === "refresh");
    const book = await this.api.book(market.coin);
    return {
      ...quoteFor(market),
      bid: number(book.levels[0][0]?.px) ?? undefined,
      ask: number(book.levels[1][0]?.px) ?? undefined,
    };
  }
  async getTickerFinancials(ticker: string): Promise<TickerFinancials> {
    return {
      quote: await this.getQuote(ticker),
      annualStatements: [],
      quarterlyStatements: [],
      priceHistory: [],
    };
  }
  async getExchangeRate(currency: string) {
    if (currency === "USD" || currency === "USDC") return 1;
    throw new Error(`Hyperliquid has no USD exchange rate for ${currency}`);
  }
  async getArticleSummary() {
    return null;
  }
  async search(query: string) {
    const q = query.trim().replace(/^HL:/i, "").toLowerCase();
    if (!q) return [];
    return (await this.api.getMarkets())
      .filter(
        (m) =>
          m.coin.toLowerCase().includes(q) || m.name.toLowerCase().includes(q),
      )
      .sort(
        (a, b) =>
          Number(b.coin.toLowerCase() === q) -
            Number(a.coin.toLowerCase() === q) ||
          Number(a.kind === "spot") - Number(b.kind === "spot") ||
          a.name.localeCompare(b.name),
      )
      .slice(0, 30)
      .map(searchResult);
  }
  async getPriceHistory(ticker: string, _exchange: string, range: TimeRange) {
    const m = await this.market(ticker),
      end = Date.now();
    return candlePoints(
      await this.api.candles(
        m.coin,
        INTERVAL[range],
        end - DAYS[range] * 86_400_000,
        end,
      ),
    );
  }
  async getPriceHistoryForResolution(
    ticker: string,
    _exchange: string,
    range: TimeRange,
    resolution: ManualChartResolution,
  ) {
    if (resolution === "45m")
      throw new Error("Hyperliquid does not support 45-minute candles");
    const [interval, step] = MANUAL[resolution],
      m = await this.market(ticker),
      end = Date.now();
    return candlePoints(
      await this.api.candles(
        m.coin,
        interval,
        end - Math.min(DAYS[range] * 86_400_000, step * 4999),
        end,
      ),
    );
  }
  getChartResolutionCapabilities(): ManualChartResolution[] {
    return Object.keys(MANUAL) as ManualChartResolution[];
  }
  subscribeQuotes(
    targets: QuoteSubscriptionTarget[],
    onQuote: (target: QuoteSubscriptionTarget, quote: Quote) => void,
  ) {
    const relevant = targets.filter((target) => this.canProvide(target.symbol));
    if (!relevant.length) return () => {};
    let active = true;
    let loading = false;
    let started = false;
    let stop = () => {};
    let matched: {
      target: QuoteSubscriptionTarget;
      market: Market;
    }[] = [];
    const refresh = async () => {
      if (loading) return;
      loading = true;
      try {
        const markets = await this.api.getMarkets();
        if (!active) return;
        matched = relevant.flatMap((target) => {
          const coin = coinFromTicker(target.symbol);
          const market = markets.find(
            (m) => m.coin.toLowerCase() === coin?.toLowerCase(),
          );
          return market ? [{ target, market }] : [];
        });
        if (started) return;
        for (const { target, market } of matched) {
          if (!active) return;
          if (market.price != null) onQuote(target, quoteFor(market));
        }
        if (!active || !matched.length) return;
        started = true;
        stop = this.stream(null, {
          mids: (mids) => {
            if (!active) return;
            for (const { target, market } of matched) {
              const price = number(mids[market.coin]);
              if (price != null)
                onQuote(target, quoteFor({ ...market, price }, true));
            }
          },
        });
      } catch {
        // The client reports failures in Connections; the timer retries metadata.
      } finally {
        loading = false;
      }
    };
    void refresh();
    const timer = setInterval(refresh, 30_000);
    return () => {
      active = false;
      clearInterval(timer);
      stop();
    };
  }
}
export const provider = new HyperliquidProvider();
