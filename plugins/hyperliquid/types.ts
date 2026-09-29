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
  kind: "perp" | "spot";
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
