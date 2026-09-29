import type { BrokerPosition } from "gloomberb/types/broker";
import type { BrokerAccount } from "gloomberb/types/trading";

export interface BrokerPortfolioSnapshot {
  accounts: BrokerAccount[];
  positions: BrokerPosition[];
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function numberValue(...values: unknown[]): number | undefined {
  for (const value of values) {
    const parsed = typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replaceAll(",", ""))
        : Number.NaN;
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function text(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function updatedAtMs(value: unknown): number | undefined {
  const timestamp = numberValue(value);
  if (timestamp == null) return undefined;
  return timestamp < 1e12 ? timestamp * 1000 : timestamp;
}

function marketPositions(payload: unknown): unknown[] {
  const item = record(payload);
  if (!item || !Array.isArray(item.market_positions)) return [];
  return item.market_positions;
}

function normalizeMarketPosition(value: unknown): BrokerPosition | null {
  const item = record(value);
  if (!item) return null;
  const ticker = text(item.ticker);
  const shares = numberValue(item.position_fp);
  if (!ticker || shares == null || shares === 0) return null;
  const marketValue = numberValue(item.market_exposure_dollars);
  return {
    ticker,
    exchange: "KALSHI",
    assetCategory: "EVENT",
    shares,
    side: shares > 0 ? "long" : "short",
    currency: "USD",
    avgCost: marketValue == null ? undefined : marketValue / Math.abs(shares),
    marketValue,
    accountId: "kalshi",
  };
}

export function normalizeKalshiSnapshot(
  balancePayload: unknown,
  positionPayloads: unknown[],
): BrokerPortfolioSnapshot {
  const balance = record(balancePayload) ?? {};
  const cash = numberValue(balance.balance_dollars);
  const portfolioValueCents = numberValue(balance.portfolio_value);
  const account: BrokerAccount = {
    accountId: "kalshi",
    name: "Kalshi",
    currency: "USD",
    totalCashValue: cash,
    settledCash: cash,
    cashBalances: cash == null ? undefined : [{ currency: "USD", quantity: cash }],
    netLiquidation: portfolioValueCents == null ? undefined : portfolioValueCents / 100,
    updatedAt: updatedAtMs(balance.updated_ts),
  };

  const positions = positionPayloads
    .flatMap(marketPositions)
    .flatMap((value) => {
      const position = normalizeMarketPosition(value);
      return position ? [position] : [];
    });

  return { accounts: [account], positions };
}
