/**
 * Polymarket market record types inlined from the first-party
 * `src/plugins/prediction-markets/services/polymarket/types` module so this
 * external plugin is self-contained.
 */

export interface PolymarketEventRecord {
  id: string;
  title: string;
  slug?: string;
  description?: string;
  endDate?: string;
  startDate?: string;
  updatedAt?: string;
  resolutionSource?: string;
  openInterest?: number;
  volume24hr?: number;
  tags?: Array<{ label?: string; slug?: string }>;
  markets?: PolymarketMarketRecord[];
}

export interface PolymarketMarketRecord {
  id?: string;
  question: string;
  conditionId?: string;
  slug?: string;
  groupItemTitle?: string;
  description?: string;
  endDate?: string;
  updatedAt?: string;
  createdAt?: string;
  volume24hr?: number;
  volumeNum?: number;
  liquidityNum?: number;
  spread?: number;
  bestBid?: number | null;
  bestAsk?: number | null;
  lastTradePrice?: number | null;
  outcomes?: string | string[];
  outcomePrices?: string | string[];
  clobTokenIds?: string | string[];
  events?: PolymarketEventRecord[];
  resolutionSource?: string;
  active?: boolean;
  closed?: boolean;
}
