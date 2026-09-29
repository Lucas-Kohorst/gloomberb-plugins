import { expect, test } from "bun:test";
import { HyperliquidClient } from "./client";
import { HyperliquidProvider } from "./provider";
import { matchesMarket, normalizeOutcomes } from "./normalize";
import type { Handlers } from "./ws";
import type { Quote } from "gloomberb/types/financials";
const context = {
  markPx: "100",
  midPx: "101",
  prevDayPx: "99",
  dayNtlVlm: "1000",
  dayBaseVlm: "10",
};
function fixture() {
  let broken = false;
  const requests: Record<string, unknown>[] = [];
  const api = new HyperliquidClient(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    requests.push(body);
    if (body.type === "perpDexs")
      return Response.json([
        null,
        { name: "xyz", fullName: "XYZ Exchange", deployer: "0xabc" },
        { name: "cash", fullName: "Dreamcash", deployer: "0xdef" },
      ]);
    if (body.type === "metaAndAssetCtxs") {
      if (broken && body.dex === "xyz")
        return new Response("", { status: 503 });
      return Response.json([
        {
          collateralToken: body.dex ? 5 : 0,
          universe: [
            {
              name: body.dex ? `${body.dex}:AAPL` : "BTC",
              szDecimals: 2,
              maxLeverage: 10,
            },
          ],
        },
        [context],
      ]);
    }
    if (body.type === "spotMetaAndAssetCtxs")
      return Response.json([
        {
          tokens: [
            { name: "USDC", index: 0, szDecimals: 8 },
            { name: "USDH", index: 5, szDecimals: 8 },
          ],
          universe: [],
        },
        [
          { ...context, coin: "#420", midPx: "0.6" },
          { ...context, coin: "#421", midPx: "0.4" },
        ],
      ]);
    if (body.type === "outcomeMeta")
      return Response.json({
        outcomes: [
          {
            outcome: 42,
            name: "Will AAPL close above 100?",
            description: "Expiry Friday",
            venue: "out",
            quoteToken: "USDH",
            sideSpecs: [{ name: "Yes" }, { name: "No" }],
          },
        ],
        deployers: [{ venue: "out", deployer: "0x123" }],
      });
    if (body.type === "clearinghouseState")
      return Response.json({
        marginSummary: { accountValue: "0", totalMarginUsed: "0" },
        assetPositions: [],
      });
    if (body.type === "spotClearinghouseState")
      return Response.json({ balances: [] });
    if (body.type === "l2Book")
      return Response.json({ coin: body.coin, time: 1, levels: [[], []] });
    throw new Error(`Unexpected ${body.type}`);
  });
  return {
    api,
    requests,
    breakXyz: () => {
      broken = true;
    },
  };
}
test("discovers all HIP operators with distinct symbols, collateral, outcomes and wallet routing", async () => {
  const { api, requests } = fixture();
  const catalog = await api.getCatalog();
  expect(catalog.warnings).toEqual([]);
  expect(catalog.operators.map((o) => `${o.protocol}:${o.id}`)).toEqual([
    "HIP-3:xyz",
    "HIP-3:cash",
    "HIP-4:out",
  ]);
  expect(catalog.markets.find((m) => m.coin === "xyz:AAPL")).toMatchObject({
    kind: "hip3",
    currency: "USDH",
    operatorName: "XYZ Exchange",
  });
  expect(catalog.markets.find((m) => m.coin === "#421")).toMatchObject({
    kind: "hip4",
    price: 0.4,
    currency: "USDH",
    deployer: "0x123",
  });
  const provider = new HyperliquidProvider(api);
  expect((await provider.search("dreamcash"))[0]?.symbol).toBe("HL:cash:AAPL");
  expect((await provider.search("out")).map((r) => r.symbol).sort()).toEqual([
    "HL:#420",
    "HL:#421",
  ]);
  expect((await provider.getQuote("HL:xyz:AAPL")).symbol).toBe("HL:xyz:AAPL");
  await api.wallet("0x" + "a".repeat(40), "xyz");
  expect(requests.find((r) => r.type === "clearinghouseState")).toMatchObject({
    dex: "xyz",
  });
});
test("one failed HIP-3 operator retains stale rows without hiding healthy venues", async () => {
  const { api, breakXyz } = fixture();
  await api.getCatalog();
  breakXyz();
  const catalog = await api.getCatalog(true);
  expect(catalog.warnings[0]).toContain("XYZ Exchange");
  expect(catalog.markets.find((m) => m.coin === "xyz:AAPL")?.status).toBe(
    "stale",
  );
  expect(catalog.markets.find((m) => m.coin === "cash:AAPL")?.price).toBe(101);
  expect(catalog.markets.filter((m) => m.kind === "hip4")).toHaveLength(2);
});
test("quote subscriptions include each required dex without losing outcome or qualified IDs", async () => {
  const { api } = fixture();
  let handlers: Handlers | undefined;
  const quotes: Quote[] = [];
  const provider = new HyperliquidProvider(api, (_coin, h) => {
    handlers = h;
    return () => {};
  });
  const stop = provider.subscribeQuotes(
    [
      { symbol: "HL:xyz:AAPL" },
      { symbol: "HL:cash:AAPL" },
      { symbol: "HL:#420" },
    ],
    (_t, q) => quotes.push(q),
  );
  try {
    await Bun.sleep(0);
    expect(handlers?.dexes?.sort()).toEqual(["", "cash", "xyz"]);
    handlers?.mids?.({ "xyz:AAPL": "102" });
    handlers?.mids?.({ "#420": "0.7" });
    expect(quotes.at(-2)).toMatchObject({
      symbol: "HL:xyz:AAPL",
      price: 102,
      currency: "USDH",
    });
    expect(quotes.at(-1)).toMatchObject({ symbol: "HL:#420", price: 0.7 });
  } finally {
    stop();
  }
});
test("HIP-4 side encoding joins by coin and missing prices remain missing", () => {
  const markets = normalizeOutcomes(
    {
      outcomes: [
        {
          outcome: 12,
          name: "Event",
          description: "Rules",
          sideSpecs: [{ name: "Yes" }, { name: "No" }],
        },
      ],
    },
    [{ ...context, coin: "#121", midPx: "0.3" }],
  );
  expect(markets.map((m) => [m.coin, m.price])).toEqual([
    ["#120", null],
    ["#121", 0.3],
  ]);
});

test("operator selection excludes substring matches from other venues", async () => {
  const { api } = fixture();
  const markets = await api.getMarkets();
  const xyz = markets.find((m) => m.operator === "xyz")!;
  expect(matchesMarket(xyz, "operator:xyz")).toBe(true);
  expect(
    matchesMarket(
      { ...xyz, operator: "other", description: "operator:xyz" },
      "operator:xyz",
    ),
  ).toBe(false);
});
