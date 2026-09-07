/**
 * Local type definitions for the Gloom Cloud congressional filing API
 * (`/cloud/congress/house`). The first-party `api-client` module is not part
 * of the public `gloomberb/*` surface, so the plugin carries its own copy of
 * the payload shapes and query params.
 */

export type CloudCongressTradeSide = "BUY" | "SELL" | "EXCHANGE" | "OTHER";

export interface CloudCongressTradePayload {
  id: string;
  chamber: "house";
  filingId: string;
  docId: string;
  memberName: string;
  stateDistrict: string;
  filingDate: string;
  transactionDate: string | null;
  notificationDate: string | null;
  lagDays: number | null;
  side: CloudCongressTradeSide;
  transactionType: string;
  ticker: string | null;
  assetName: string;
  assetType: string | null;
  owner: string;
  rawOwner: string;
  amount: string;
  amountLow: number | null;
  amountHigh: number | null;
  capGainsOver200: boolean | null;
  filingStatus: string | null;
  subholdingOf: string | null;
  description: string | null;
  sourceUrl: string;
}

export interface CloudCongressMemberPayload {
  id: string;
  memberName: string;
  stateDistrict: string;
  tradeCount: number;
  buyCount: number;
  sellCount: number;
  exchangeCount: number;
  otherCount: number;
  estimatedLow: number | null;
  estimatedHigh: number | null;
  lastFilingDate: string | null;
  avgLagDays: number | null;
}

export interface CloudCongressHousePayload {
  asOf: string;
  chamber: "house";
  source: "house-clerk";
  year: number;
  indexUpdatedAt: string | null;
  filingsScanned: number;
  filingCount: number;
  filingOffset?: number;
  hasMore?: boolean;
  hasMoreFilings?: boolean;
  nextOffset?: number;
  nextFilingOffset?: number;
  trades: CloudCongressTradePayload[];
  members: CloudCongressMemberPayload[];
}

export type CloudCongressHouseParams = {
  year?: number;
  limit?: number;
  offset?: number;
  filingLimit?: number;
  filingOffset?: number;
  member?: string;
  ticker?: string;
  refresh?: boolean;
};

/** Mirrors the host's cloud API base URL (`process.env.GLOOMBERB_API_URL`). */
export const CONGRESS_API_BASE_URL =
  typeof process !== "undefined" && typeof process.env?.GLOOMBERB_API_URL === "string"
    ? process.env.GLOOMBERB_API_URL
    : "https://api.gloom.sh";
