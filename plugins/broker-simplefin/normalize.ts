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

function text(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
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

function nested(source: UnknownRecord, key: string): UnknownRecord {
  return record(source[key]) ?? {};
}

function allRecords(value: unknown, output: UnknownRecord[] = [], seen = new Set<object>()): UnknownRecord[] {
  if (value === null || typeof value !== "object" || seen.has(value)) return output;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) allRecords(item, output, seen);
    return output;
  }
  const item = value as UnknownRecord;
  output.push(item);
  for (const child of Object.values(item)) allRecords(child, output, seen);
  return output;
}

function accountId(source: UnknownRecord): string {
  return text(
    source.accountId,
    source.account_id,
    source.accountNumber,
    source.account_number,
    source.brokerageAccountId,
    source.brokerage_account_id,
  );
}

function titleCase(value: string): string {
  return value.toLowerCase().replace(/(^|[_\s-])([a-z])/g, (_match, prefix: string, letter: string) => (
    `${prefix === "_" ? " " : prefix}${letter.toUpperCase()}`
  ));
}

function uniqueSnapshot(accounts: BrokerAccount[], positions: BrokerPosition[]): BrokerPortfolioSnapshot {
  const uniqueAccounts = [...new Map(accounts.map((account) => [account.accountId, account])).values()];
  const knownAccounts = new Set(uniqueAccounts.map((account) => account.accountId));
  for (const position of positions) {
    if (!position.accountId || knownAccounts.has(position.accountId)) continue;
    knownAccounts.add(position.accountId);
    uniqueAccounts.push({
      accountId: position.accountId,
      name: position.accountId,
      currency: position.currency,
    });
  }
  return { accounts: uniqueAccounts, positions: mergeIdenticalPositions(positions.map(withCanonicalShares)) };
}

/**
 * Canonicalize broker positions so `shares` is a positive magnitude and `side`
 * carries the direction. Some broker feeds report short shares as negative
 * while also tagging `side: "short"`; leaving shares negative double-signs every
 * downstream consumer that derives direction from `side`.
 */
function withCanonicalShares(position: BrokerPosition): BrokerPosition {
  const side = position.side ?? (position.shares < 0 ? "short" : "long");
  const shares = Math.abs(position.shares);
  if (shares === position.shares && side === position.side) return position;
  return { ...position, shares, side };
}

function signedBrokerShares(position: BrokerPosition): number {
  return Math.abs(position.shares) * (position.side === "short" ? -1 : 1);
}

function mergeIdenticalPositions(positions: BrokerPosition[]): BrokerPosition[] {
  const merged = new Map<string, BrokerPosition>();
  for (const position of positions) {
    const key = [
      position.accountId ?? "",
      position.ticker,
      position.assetCategory ?? "",
      position.exchange ?? "",
      position.brokerContract?.conId ?? "",
    ].join(":");
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, position);
      continue;
    }
    // The key ignores side, so opposing legs of one contract land here and must
    // still net out. That needs signed magnitudes now that `shares` is canonical.
    const existingShares = signedBrokerShares(existing);
    const nextShares = signedBrokerShares(position);
    const shares = existingShares + nextShares;
    const existingCost = (existing.avgCost ?? 0) * existingShares;
    const nextCost = (position.avgCost ?? 0) * nextShares;
    merged.set(key, {
      ...existing,
      shares: Math.abs(shares),
      side: shares < 0 ? "short" : "long",
      avgCost: shares !== 0 ? (existingCost + nextCost) / shares : existing.avgCost,
      marketValue: sumOptional(existing.marketValue, position.marketValue),
      unrealizedPnl: sumOptional(existing.unrealizedPnl, position.unrealizedPnl),
    });
  }
  return [...merged.values()];
}

function sumOptional(left?: number, right?: number): number | undefined {
  if (left == null && right == null) return undefined;
  return (left ?? 0) + (right ?? 0);
}

export function normalizeSimpleFinSnapshot(payload: unknown): BrokerPortfolioSnapshot {
  const root = record(payload);
  const rawAccounts = Array.isArray(root?.accounts) ? root.accounts : [];
  const accounts: BrokerAccount[] = [];
  const positions: BrokerPosition[] = [];
  for (const rawAccount of rawAccounts) {
    const account = record(rawAccount);
    if (!account) continue;
    const id = text(account.id);
    const holdings = Array.isArray(account.holdings) ? account.holdings : [];
    if (!id || holdings.length === 0) continue;
    const currency = text(account.currency, "USD").toUpperCase();
    accounts.push({
      accountId: `${text(account.conn_id)}:${id}`,
      name: text(account.name, id),
      currency,
      netLiquidation: numberValue(account.balance),
      updatedAt: (numberValue(account["balance-date"]) ?? 0) * 1000 || undefined,
    });
    const normalizedAccountId = accounts.at(-1)!.accountId;
    for (const rawHolding of holdings) {
      const holding = record(rawHolding);
      if (!holding) continue;
      const symbol = text(holding.symbol, holding.ticker, holding.code).toUpperCase();
      const shares = numberValue(holding.shares, holding.quantity, holding.units);
      const marketValue = numberValue(holding.market_value, holding.marketValue, holding.value);
      if (!symbol || shares == null || shares === 0) continue;
      const costBasis = numberValue(holding.cost_basis, holding.costBasis);
      const avgCost = numberValue(
        holding.purchase_price,
        holding.average_price,
        holding.average_cost,
        costBasis != null ? costBasis / Math.abs(shares) : undefined,
      );
      positions.push({
        ticker: symbol,
        exchange: text(holding.exchange, "SMART").toUpperCase(),
        shares,
        avgCost,
        currency: text(holding.currency, currency).toUpperCase(),
        accountId: normalizedAccountId,
        name: text(holding.description, holding.name, symbol),
        assetCategory: text(holding.type, holding.asset_type, "STK").toUpperCase(),
        markPrice: numberValue(
          holding.price,
          holding.current_price,
          holding.market_price,
          marketValue != null ? marketValue / Math.abs(shares) : undefined,
        ),
        marketValue,
        side: shares < 0 ? "short" : "long",
      });
    }
  }
  return uniqueSnapshot(accounts, positions);
}
