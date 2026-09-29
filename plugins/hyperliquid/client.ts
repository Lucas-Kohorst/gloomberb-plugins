import { createThrottledFetch, httpFetch } from "gloomberb/utils";
import { withConnectionRequest } from "gloomberb/plugins";
import { normalizeMarkets } from "./normalize";
import type {
  AssetContext,
  PerpMeta,
  SpotMeta,
  Market,
  Book,
  Candle,
  WalletState,
  SpotState,
} from "./types";
const transport = createThrottledFetch({
  requestsPerMinute: 120,
  maxRetries: 1,
  timeoutMs: 10_000,
  transport: httpFetch,
});
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
export class HyperliquidClient {
  private cache: { markets: Market[]; at: number } | null = null;
  private pending: Promise<Market[]> | null = null;
  constructor(
    private fetch: Fetch = (url, init) => transport.fetch(url, init),
  ) {}
  async info<T>(body: Record<string, unknown>): Promise<T> {
    return withConnectionRequest("hyperliquid", String(body.type), async () => {
      const response = await this.fetch("https://api.hyperliquid.xyz/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok)
        throw new Error(`Hyperliquid ${body.type}: HTTP ${response.status}`);
      return (await response.json()) as T;
    });
  }
  getMarkets(force = false): Promise<Market[]> {
    if (!force && this.cache && Date.now() - this.cache.at < 30_000)
      return Promise.resolve(this.cache.markets);
    if (this.pending) return this.pending;
    this.pending = Promise.all([
      this.info<[PerpMeta, AssetContext[]]>({ type: "metaAndAssetCtxs" }),
      this.info<[SpotMeta, AssetContext[]]>({ type: "spotMetaAndAssetCtxs" }),
    ])
      .then(([perps, spots]) => {
        const markets = normalizeMarkets(perps, spots);
        this.cache = { markets, at: Date.now() };
        return markets;
      })
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }
  book(coin: string) {
    return this.info<Book>({ type: "l2Book", coin });
  }
  candles(coin: string, interval: string, startTime: number, endTime: number) {
    return this.info<Candle[]>({
      type: "candleSnapshot",
      req: { coin, interval, startTime, endTime },
    });
  }
  wallet(user: string): Promise<[WalletState, SpotState]> {
    if (!/^0x[0-9a-f]{40}$/i.test(user))
      return Promise.reject(
        new Error("Enter a valid 0x wallet address in pane settings."),
      );
    return Promise.all([
      this.info<WalletState>({ type: "clearinghouseState", user }),
      this.info<SpotState>({ type: "spotClearinghouseState", user }),
    ]);
  }
}
export const client = new HyperliquidClient();
