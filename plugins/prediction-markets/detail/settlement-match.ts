import type { PredictionMarketSummary } from "../types";

export type SettlementMatchRank = "rules" | "map" | "ticker" | "alias";

export interface SettlementSeriesMatch {
  id: string;
  label: string;
  source: string;
  expression: string;
  reason: SettlementMatchRank;
  url?: string;
  description?: string;
}

export interface SettlementMatchResult {
  sourceLabel: string | null;
  sourceSnippet: string | null;
  series: SettlementSeriesMatch[];
}

type SummaryFields = Pick<
  PredictionMarketSummary,
  | "venue"
  | "marketId"
  | "title"
  | "marketLabel"
  | "eventLabel"
  | "eventTicker"
  | "seriesTicker"
  | "category"
  | "description"
  | "rulesPrimary"
  | "rulesSecondary"
  | "resolutionSource"
  | "url"
>;

const EXPRESSION_RE = /\b((?:FRED|UST|WX|NWS|POLL|ADJ):[A-Za-z0-9][A-Za-z0-9._:-]{0,80}|[A-Z]{2,6}-USD)\b/gi;
const CRYPTO = new Map([
  ["BTC-USD", "Bitcoin"],
  ["ETH-USD", "Ethereum"],
  ["SOL-USD", "Solana"],
  ["XRP-USD", "XRP"],
]);

function addSeries(
  series: SettlementSeriesMatch[],
  row: SettlementSeriesMatch,
): void {
  if (series.some((entry) => entry.expression === row.expression)) return;
  series.push(row);
}

function expressionRow(expression: string, reason: SettlementMatchRank): SettlementSeriesMatch {
  const [prefix, rawId = ""] = expression.split(":");
  const id = rawId.trim();
  const source = prefix === "FRED" || prefix === "UST" ? "FRED"
    : prefix === "ADJ" ? "Adjacent"
      : prefix === "POLL" ? "VoteHub"
        : prefix === "WX" || prefix === "NWS" ? "Weather"
          : "Market";
  return {
    id: `${prefix.toLowerCase()}:${id.toLowerCase()}`,
    label: `${id} (${prefix})`,
    source,
    expression,
    reason,
    url: prefix === "FRED" ? `https://fred.stlouisfed.org/series/${id}` : undefined,
  };
}

function textFields(summary: SummaryFields): string {
  return [
    summary.title,
    summary.marketLabel,
    summary.eventLabel,
    summary.category,
    summary.description,
    summary.rulesPrimary,
    summary.rulesSecondary,
    summary.resolutionSource,
  ].filter((value): value is string => !!value && value.trim().length > 0).join("\n");
}

export function matchSettlementSeries(summary: SummaryFields): SettlementMatchResult {
  const rulesText = [
    summary.resolutionSource,
    summary.rulesPrimary,
    summary.rulesSecondary,
  ].filter((value): value is string => !!value && !!value.trim()).join("\n");
  const fullText = textFields(summary);
  const series: SettlementSeriesMatch[] = [];

  EXPRESSION_RE.lastIndex = 0;
  for (const match of rulesText.matchAll(EXPRESSION_RE)) {
    const expression = match[1];
    if (!expression) continue;
    const upper = expression.toUpperCase();
    const crypto = CRYPTO.get(upper);
    if (crypto) {
      addSeries(series, {
        id: `crypto:${upper}`,
        label: `${crypto} (${upper})`,
        source: "Market",
        expression: `${upper}:price`,
        reason: "rules",
      });
    } else {
      addSeries(series, expressionRow(upper, "rules"));
    }
  }

  for (const [symbol, name] of CRYPTO) {
    if (new RegExp(`\\b${symbol.split("-")[0]}\\b`, "i").test(fullText)) {
      addSeries(series, {
        id: `crypto:${symbol}`,
        label: `${name} (${symbol})`,
        source: "Market",
        expression: `${symbol}:price`,
        reason: "alias",
      });
    }
  }

  const snippetLines = rulesText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const sourceSnippet = snippetLines[0]
    ? snippetLines[0].length > 180 ? `${snippetLines[0].slice(0, 177)}...` : snippetLines[0]
    : null;
  const sourceLabel = summary.resolutionSource?.trim()
    || series[0]?.label
    || sourceSnippet
    || null;

  return { sourceLabel, sourceSnippet, series };
}
