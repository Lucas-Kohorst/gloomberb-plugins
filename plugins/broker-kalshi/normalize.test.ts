import { describe, expect, test } from "bun:test";
import { normalizeKalshiSnapshot } from "./normalize";

const yesPosition = {
  ticker: "KXHIGHNY-25SEP18-T82",
  position_fp: "10.00",
  market_exposure_dollars: "25.00",
};

const noPosition = {
  ticker: "INXD-25DEC31-T5000",
  position_fp: "-5.00",
  market_exposure_dollars: "12.50",
};

const zeroPosition = {
  ticker: "SKIP-ZERO",
  position_fp: "0.00",
  market_exposure_dollars: "0.00",
};

const pageOne = {
  market_positions: [yesPosition, zeroPosition],
  event_positions: [{
    event_ticker: "KXHIGHNY-25SEP18",
    position_fp: "99.00",
    market_exposure_dollars: "999.00",
  }],
  cursor: "page-2",
};

const pageTwo = {
  market_positions: [noPosition],
  event_positions: [],
  cursor: "",
};

const balance = {
  balance_dollars: "150.00",
  portfolio_value: 25000,
  updated_ts: 1_703_123_456,
};

describe("normalizeKalshiSnapshot", () => {
  test("maps YES and NO market positions, skips zeros, and concatenates pages", () => {
    const snapshot = normalizeKalshiSnapshot(balance, [pageOne, pageTwo]);

    expect(snapshot.positions.map((position) => position.ticker)).toEqual([
      "KXHIGHNY-25SEP18-T82",
      "INXD-25DEC31-T5000",
    ]);

    expect(snapshot.positions[0]).toEqual({
      ticker: "KXHIGHNY-25SEP18-T82",
      exchange: "KALSHI",
      assetCategory: "EVENT",
      shares: 10,
      side: "long",
      currency: "USD",
      avgCost: 2.5,
      marketValue: 25,
      accountId: "kalshi",
    });

    expect(snapshot.positions[1]).toEqual({
      ticker: "INXD-25DEC31-T5000",
      exchange: "KALSHI",
      assetCategory: "EVENT",
      shares: -5,
      side: "short",
      currency: "USD",
      avgCost: 2.5,
      marketValue: 12.5,
      accountId: "kalshi",
    });
  });

  test("maps cash, portfolio value in cents, and second timestamps", () => {
    const snapshot = normalizeKalshiSnapshot(balance, [pageOne, pageTwo]);
    expect(snapshot.accounts).toEqual([{
      accountId: "kalshi",
      name: "Kalshi",
      currency: "USD",
      totalCashValue: 150,
      settledCash: 150,
      cashBalances: [{ currency: "USD", quantity: 150 }],
      netLiquidation: 250,
      updatedAt: 1_703_123_456_000,
    }]);
  });

  test("keeps millisecond updated_ts as-is", () => {
    const snapshot = normalizeKalshiSnapshot({
      ...balance,
      updated_ts: 1_703_123_456_000,
    }, []);
    expect(snapshot.accounts[0]?.updatedAt).toBe(1_703_123_456_000);
  });
});
