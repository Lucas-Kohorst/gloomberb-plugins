import { createThrottledFetch, httpFetch } from "gloomberb/utils";
import { withConnectionRequest } from "gloomberb/plugins";
import {
  normalizeMarkets,
  normalizePerps,
  normalizeOutcomes,
} from "./normalize";
import type {
  AssetContext,
  PerpMeta,
  SpotMeta,
  Market,
  Book,
  Candle,
  WalletState,
  SpotState,
  PerpDex,
  OutcomeMeta,
  Catalog,
} from "./types";
const transport = createThrottledFetch({
  requestsPerMinute: 120,
  maxRetries: 1,
  timeoutMs: 10_000,
  transport: httpFetch,
});
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
export class HyperliquidClient {
  private cache: { catalog: Catalog; at: number } | null = null;
  private pending: Promise<Catalog> | null = null;
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
  async getMarkets(force = false): Promise<Market[]> {
    return (await this.getCatalog(force)).markets;
  }
  getCatalog(force = false): Promise<Catalog> {
    if (!force && this.cache && Date.now() - this.cache.at < 30_000)
      return Promise.resolve(this.cache.catalog);
    if (this.pending) return this.pending;
    this.pending = this.fetchCatalog()
      .then((catalog) => {
        this.cache = { catalog, at: Date.now() };
        return catalog;
      })
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }
  private async fetchCatalog(): Promise<Catalog> {
    const [perps, spots, dexes, outcomes] = await Promise.allSettled([
      this.info<[PerpMeta, AssetContext[]]>({ type: "metaAndAssetCtxs" }),
      this.info<[SpotMeta, AssetContext[]]>({ type: "spotMetaAndAssetCtxs" }),
      this.info<(PerpDex | null)[]>({ type: "perpDexs" }),
      this.info<OutcomeMeta>({ type: "outcomeMeta" }),
    ]);
    const markets: Market[] = [],
      operators: Catalog["operators"] = [],
      warnings: string[] = [];
    const old = this.cache?.catalog;
    const stale = (
      label: string,
      reason: unknown,
      matches: (m: Market) => boolean,
    ) => {
      warnings.push(
        `${label}: ${reason instanceof Error ? reason.message : String(reason)}`,
      );
      markets.push(
        ...(old?.markets
          .filter(matches)
          .map((m) => ({ ...m, status: "stale" as const })) ?? []),
      );
    };
    const spotData: [SpotMeta, AssetContext[]] =
      spots.status === "fulfilled"
        ? spots.value
        : [{ tokens: [], universe: [] }, []];
    if (perps.status === "fulfilled")
      markets.push(...normalizePerps(perps.value, spotData[0]));
    else stale("Native perpetuals", perps.reason, (m) => m.kind === "perp");
    if (spots.status === "fulfilled")
      markets.push(...normalizeMarkets([{ universe: [] }, []], spots.value));
    else stale("Spot prices", spots.reason, (m) => m.kind === "spot");
    if (dexes.status === "fulfilled") {
      const venues = dexes.value.filter((d): d is PerpDex => d !== null);
      operators.push(
        ...venues.map((d) => ({
          id: d.name,
          name: d.fullName,
          protocol: "HIP-3" as const,
          deployer: d.deployer,
        })),
      );
      // Bound fan-out independently of how many operators join the exchange.
      for (let start = 0; start < venues.length; start += 4) {
        const batch = venues.slice(start, start + 4);
        const results = await Promise.allSettled(
          batch.map((d) =>
            this.info<[PerpMeta, AssetContext[]]>({
              type: "metaAndAssetCtxs",
              dex: d.name,
            }),
          ),
        );
        results.forEach((r, i) => {
          const dex = batch[i]!;
          if (r.status === "fulfilled")
            markets.push(...normalizePerps(r.value, spotData[0], dex));
          else
            stale(
              dex.fullName,
              r.reason,
              (m) => m.kind === "hip3" && m.operator === dex.name,
            );
        });
      }
    } else {
      stale("HIP-3 operators", dexes.reason, (m) => m.kind === "hip3");
      operators.push(
        ...(old?.operators.filter((o) => o.protocol === "HIP-3") ?? []),
      );
    }
    if (outcomes.status === "fulfilled") {
      operators.push(
        ...(outcomes.value.deployers ?? []).map((d) => ({
          id: d.venue,
          name: d.venue,
          protocol: "HIP-4" as const,
          deployer: d.deployer,
        })),
      );
      const prior = new Map(
        old?.markets.filter((m) => m.kind === "hip4").map((m) => [m.coin, m]),
      );
      markets.push(
        ...normalizeOutcomes(outcomes.value, spotData[1]).map((m) =>
          spots.status === "fulfilled"
            ? m
            : { ...m, ...prior.get(m.coin), status: "stale" as const },
        ),
      );
    } else {
      stale("HIP-4 outcomes", outcomes.reason, (m) => m.kind === "hip4");
      operators.push(
        ...(old?.operators.filter((o) => o.protocol === "HIP-4") ?? []),
      );
    }
    if (!markets.length && warnings.length)
      throw new Error(warnings.join("; "));
    return { markets, operators, warnings };
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
  wallet(user: string, dex = ""): Promise<[WalletState, SpotState]> {
    if (!/^0x[0-9a-f]{40}$/i.test(user))
      return Promise.reject(
        new Error("Enter a valid 0x wallet address in pane settings."),
      );
    return Promise.all([
      this.info<WalletState>({ type: "clearinghouseState", user, dex }),
      this.info<SpotState>({ type: "spotClearinghouseState", user }),
    ]);
  }
}
export const client = new HyperliquidClient();
