import { afterEach, expect, test } from "bun:test";
import { setHttpFetchTransport } from "gloomberb/utils";
import { parseDefiLlamaSeriesId, defillamaSeriesLabel, defillamaSeriesCatalog } from "./catalog";
import { resolveDefiLlamaChartSeries } from "./chart-series";

afterEach(() => {
  setHttpFetchTransport(null);
});

test("parseDefiLlamaSeriesId accepts valid chain and protocol series", () => {
  expect(parseDefiLlamaSeriesId("chain/ethereum/tvl")).toEqual({ kind: "chain", slug: "ethereum", metric: "tvl" });
  expect(parseDefiLlamaSeriesId("protocol/aave/fees")).toEqual({ kind: "protocol", slug: "aave", metric: "fees" });
});

test("parseDefiLlamaSeriesId rejects invalid series ids", () => {
  expect(parseDefiLlamaSeriesId("aave/tvl")).toBeNull();
  expect(parseDefiLlamaSeriesId("chain/ethereum/fees")).toBeNull();
  expect(parseDefiLlamaSeriesId("protocol/aave/price")).toBeNull();
  expect(parseDefiLlamaSeriesId("protocol/../aave/tvl")).toBeNull();
});

test("catalog entries are searchable", () => {
  const entries = defillamaSeriesCatalog.entries ?? [];
  expect(entries.some((entry) => entry.id === "chain/ethereum/tvl")).toBe(true);
  expect(entries.some((entry) => entry.id === "protocol/aave/fees")).toBe(true);
});

test("defillamaSeriesLabel uses catalog labels for known series", () => {
  expect(defillamaSeriesLabel({ kind: "chain", slug: "ethereum", metric: "tvl" })).toContain("Ethereum");
  expect(defillamaSeriesLabel({ kind: "protocol", slug: "aave", metric: "fees" })).toContain("Aave");
});

test("resolveDefiLlamaChartSeries loads chain TVL data", async () => {
  setHttpFetchTransport(async (url) => {
    expect(url).toBe("https://api.llama.fi/v2/historicalChainTvl/ethereum");
    return Response.json([{ date: 1704067200, tvl: 100 }, { date: 1704153600, tvl: 150 }]);
  });
  const series = await resolveDefiLlamaChartSeries("chain/ethereum/tvl");
  expect(series.points.map((point) => point.value)).toEqual([100, 150]);
  expect(series.unit).toBe("USD");
});
