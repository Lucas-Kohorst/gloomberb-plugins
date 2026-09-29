import { expect, test } from "bun:test";
import { HyperliquidClient } from "./client";
import { HyperliquidProvider } from "./provider";
import { candlePoints, mergeTrades } from "./normalize";
const ctx = {
  midPx: "110",
  markPx: "109",
  prevDayPx: "100",
  dayNtlVlm: "9000",
  dayBaseVlm: "90",
  funding: "0.0001",
  openInterest: "500",
};
const perps = [
  { universe: [{ name: "HYPE", szDecimals: 2, maxLeverage: 10 }] },
  [ctx],
];
const spots = [
  {
    tokens: [
      { index: 150, name: "HYPE", szDecimals: 2 },
      { index: 0, name: "USDC", szDecimals: 8 },
    ],
    universe: [{ name: "@107", index: 107, tokens: [150, 0] }],
  },
  [
    { ...ctx, coin: "@105", midPx: "0.08" },
    { ...ctx, coin: "@107" },
  ],
];
function fixture() {
  const requests: Record<string, any>[] = [];
  const api = new HyperliquidClient(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    requests.push(body);
    if (body.type === "metaAndAssetCtxs") return Response.json(perps);
    if (body.type === "spotMetaAndAssetCtxs") return Response.json(spots);
    if (body.type === "l2Book")
      return Response.json({
        coin: body.coin,
        time: 1,
        levels: [
          [{ px: "109", sz: "2", n: 1 }],
          [{ px: "111", sz: "3", n: 1 }],
        ],
      });
    if (body.type === "candleSnapshot")
      return Response.json([{ t: 1, o: "1", h: "3", l: "1", c: "2", v: "7" }]);
    throw new Error(`Unexpected request ${body.type}`);
  });
  return { api, requests };
}
test("context tuples preserve spot IDs and share concurrent catalog loads", async () => {
  const { api, requests } = fixture();
  const [a, b] = await Promise.all([api.getMarkets(), api.getMarkets()]);
  expect(a).toBe(b);
  expect(requests).toHaveLength(2);
  expect(a[1]).toMatchObject({
    coin: "@107",
    name: "HYPE/USDC",
    kind: "spot",
    currency: "USD",
    price: 110,
  });
  await api.getMarkets();
  expect(requests).toHaveLength(2);
  await api.getMarkets(true);
  expect(requests).toHaveLength(4);
});
test("failed catalog requests can retry without caching the failure", async () => {
  let fail = true;
  const api = new HyperliquidClient(async (_u, init) =>
    fail
      ? new Response("", { status: 429 })
      : Response.json(
          JSON.parse(String(init?.body)).type === "metaAndAssetCtxs"
            ? perps
            : spots,
        ),
  );
  await expect(api.getMarkets()).rejects.toThrow("429");
  fail = false;
  expect(await api.getMarkets()).toHaveLength(2);
});
test("HL search, quotes and candle requests keep perp/spot identities distinct", async () => {
  const { api, requests } = fixture();
  const p = new HyperliquidProvider(api);
  expect((await p.search("HL:HYPE")).map((r) => r.symbol)).toEqual([
    "HL:HYPE",
    "HL:@107",
  ]);
  expect(await p.getQuote("hl:@107")).toMatchObject({
    symbol: "HL:@107",
    bid: 109,
    ask: 111,
    price: 110,
    change: 10,
    volume: 90,
  });
  await p.getPriceHistoryForResolution("HL:@107", "Hyperliquid", "1M", "5m");
  const req = requests.at(-1)!.req;
  expect(req.coin).toBe("@107");
  expect(req.interval).toBe("5m");
  expect(req.endTime - req.startTime).toBe(4999 * 300_000);
  expect(p.canProvide("HYPE-USD")).toBe(false);
});
test("streaming quotes retain daily change and stop delivering after unsubscribe", async () => {
  const { api } = fixture();
  let handlers: any;
  let closed = 0;
  const p = new HyperliquidProvider(api, (_coin, h) => {
    handlers = h;
    return () => {
      closed++;
    };
  });
  const quotes: any[] = [];
  const stop = p.subscribeQuotes([{ symbol: "HL:HYPE" }], (_t, q) =>
    quotes.push(q),
  );
  await Bun.sleep(0);
  handlers.mids({ HYPE: "120" });
  expect(quotes.at(-1)).toMatchObject({
    price: 120,
    change: 20,
    previousClose: 100,
    dataSource: "live",
  });
  stop();
  const count = quotes.length;
  handlers.mids({ HYPE: "130" });
  expect(quotes).toHaveLength(count);
  expect(closed).toBe(1);
});
test("unsubscribe during initial REST load cannot create an orphan socket", async () => {
  const { api } = fixture();
  let sockets = 0;
  const p = new HyperliquidProvider(api, () => {
    sockets++;
    return () => {};
  });
  const stop = p.subscribeQuotes([{ symbol: "HL:HYPE" }], () => {
    throw new Error("Late quote");
  });
  stop();
  await Bun.sleep(0);
  expect(sockets).toBe(0);
});
test("candles reject invalid numbers and sort/deduplicate; trade replay stays bounded", () => {
  const c = { t: 2, o: "1", h: "3", l: "1", c: "2", v: "5" };
  expect(
    candlePoints([
      c,
      { ...c, t: 1 },
      { ...c, c: "bad" },
      { ...c, c: "2.5" },
    ]).map((p) => p.close),
  ).toEqual([2, 2.5]);
  const trades = Array.from({ length: 110 }, (_, i) => ({
    coin: "HYPE",
    time: i,
    tid: i,
    px: "1",
    sz: "1",
    side: "B",
  }));
  const merged = mergeTrades(trades, trades.slice(100));
  expect(merged).toHaveLength(100);
  expect(merged[0]!.tid).toBe(109);
});
