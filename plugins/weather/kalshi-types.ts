/**
 * Kalshi market record types inlined from the first-party
 * `src/plugins/prediction-markets/services/kalshi/types` module so this
 * external plugin is self-contained.
 */

export interface KalshiMarketRecord {
  ticker: string;
  title: string;
  yes_sub_title?: string;
  no_sub_title?: string;
  event_ticker?: string;
  close_time?: string;
  open_time?: string;
  created_time?: string;
  updated_time?: string;
  status?: string;
  market_type?: string;
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
  no_bid_dollars?: string;
  no_ask_dollars?: string;
  last_price_dollars?: string;
  volume_24h_fp?: string;
  volume_fp?: string;
  open_interest_fp?: string;
  notional_value_dollars?: string;
  liquidity_dollars?: string;
  rules_primary?: string;
  rules_secondary?: string;
  strike_type?: string;
  floor_strike?: number | string;
  cap_strike?: number | string;
  custom_strike?: unknown;
  is_provisional?: boolean;
  /** Settlement result ("yes", "no", "void") once the market is resolved. */
  result?: string;
  /** Settlement value (e.g. the verified daily-high temperature). */
  expiration_value?: string | number;
}

export interface KalshiEventRecord {
  title: string;
  category?: string;
  event_ticker?: string;
  series_ticker?: string;
  sub_title?: string;
  markets?: KalshiMarketRecord[];
}

export interface KalshiEventResponse {
  event: {
    title: string;
    sub_title?: string;
    category?: string;
    event_ticker?: string;
    series_ticker?: string;
  };
  markets: KalshiMarketRecord[];
}

export interface KalshiCandlestickResponse {
  candlesticks?: Array<{
    end_period_ts: number;
    volume_fp?: string;
    price?: {
      open_dollars?: string;
      high_dollars?: string;
      low_dollars?: string;
      close_dollars?: string;
      previous_dollars?: string;
    };
  }>;
}
