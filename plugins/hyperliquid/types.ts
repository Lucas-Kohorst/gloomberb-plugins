export interface AssetContext {
  coin?: string;
  midPx?: string | null;
  markPx: string;
  prevDayPx: string;
  dayNtlVlm: string;
  dayBaseVlm?: string;
  funding?: string;
  openInterest?: string;
}
export interface PerpMeta {
  collateralToken?: number;
  universe: {
    name: string;
    szDecimals: number;
    maxLeverage: number;
    isDelisted?: boolean;
  }[];
}
export interface SpotMeta {
  tokens: { name: string; index: number; szDecimals: number }[];
  universe: { name: string; index: number; tokens: [number, number] }[];
}
export interface Market {
  coin: string;
  name: string;
  kind: "perp" | "spot" | "hip3" | "hip4";
  operator: string;
  operatorName: string;
  deployer: string | null;
  description?: string;
  status?: "current" | "stale";
  currency: string;
  price: number | null;
  previous: number | null;
  volume: number | null;
  baseVolume: number | null;
  funding: number | null;
  openInterest: number | null;
  leverage: number;
  mark: number | null;
}
export interface Level {
  px: string;
  sz: string;
  n: number;
}
export interface Book {
  coin: string;
  time: number;
  levels: [Level[], Level[]];
}
export interface Trade {
  coin: string;
  time: number;
  tid: number;
  px: string;
  sz: string;
  side: string;
}
export interface Candle {
  t: number;
  o: string;
  h: string;
  l: string;
  c: string;
  v: string;
}
export interface WalletState {
  marginSummary: { accountValue: string; totalMarginUsed: string };
  assetPositions: {
    position: {
      coin: string;
      szi: string;
      entryPx: string | null;
      unrealizedPnl: string;
      liquidationPx: string | null;
    };
  }[];
}
export interface SpotState {
  balances: { coin: string; total: string; hold: string }[];
}
export type StreamStatus = "connecting" | "live" | "reconnecting";

export interface PerpDex {
  name: string;
  fullName: string;
  deployer: string;
}
export interface OutcomeMeta {
  outcomes: {
    outcome: number;
    name: string;
    description: string;
    sideSpecs: { name: string }[];
    quoteToken?: string;
    venue?: string;
  }[];
  deployers?: { venue: string; deployer: string }[];
  questions?: {
    question: number;
    name: string;
    description: string;
    fallbackOutcome: number;
    namedOutcomes: number[];
  }[];
}
export interface Operator {
  id: string;
  name: string;
  protocol: "HIP-3" | "HIP-4";
  deployer: string;
}
export interface Catalog {
  markets: Market[];
  operators: Operator[];
  warnings: string[];
}
