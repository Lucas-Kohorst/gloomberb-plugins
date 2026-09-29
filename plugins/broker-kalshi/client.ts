import { kalshiAuthHeaders } from "./auth";
import { normalizeKalshiSnapshot, type BrokerPortfolioSnapshot } from "./normalize";

export type KalshiEnvironment = "production" | "demo";

export const KALSHI_API_BASES = {
  production: "https://external-api.kalshi.com/trade-api/v2",
  demo: "https://external-api.demo.kalshi.co/trade-api/v2",
} as const;

const REJECTED_KEY = "Kalshi rejected the API key. Check the Key ID and PEM; use a read-only key.";
const TIMEOUT = "Kalshi took too long to respond.";
const UNREACHABLE = "Gloomberb could not reach Kalshi.";
const INVALID_JSON = "Kalshi returned an invalid response.";
const BAD_PEM = "Kalshi could not sign the request. Check the PEM private key.";

type FetchLike = typeof fetch;

export function kalshiApiBase(environment: string | undefined): string {
  return environment === "demo" ? KALSHI_API_BASES.demo : KALSHI_API_BASES.production;
}

function nextCursor(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || !("cursor" in payload)) {
    return undefined;
  }
  const cursor = payload.cursor;
  if (typeof cursor !== "string") return undefined;
  const trimmed = cursor.trim();
  return trimmed || undefined;
}

async function kalshiRequest(
  url: URL,
  keyId: string,
  privateKey: string,
  fetchImpl: FetchLike,
  timeoutMs = 20_000,
): Promise<unknown> {
  let headers: Record<string, string>;
  try {
    headers = kalshiAuthHeaders(keyId, privateKey, "GET", `${url.pathname}${url.search}`);
  } catch {
    throw new Error(BAD_PEM);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { ...headers, Accept: "application/json" },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error(TIMEOUT);
    throw new Error(UNREACHABLE);
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401 || response.status === 403) throw new Error(REJECTED_KEY);
  if (!response.ok) throw new Error(`Kalshi request failed (${response.status}).`);
  try {
    return await response.json();
  } catch {
    throw new Error(INVALID_JSON);
  }
}

export async function loadKalshiPortfolio(options: {
  keyId: string;
  privateKey: string;
  environment?: string;
  fetchImpl?: FetchLike;
}): Promise<BrokerPortfolioSnapshot> {
  const keyId = options.keyId.trim();
  const privateKey = options.privateKey.trim();
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = kalshiApiBase(options.environment);

  const balance = await kalshiRequest(new URL(`${base}/portfolio/balance`), keyId, privateKey, fetchImpl);

  const pages: unknown[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const url = new URL(`${base}/portfolio/positions`);
    url.searchParams.set("count_filter", "position");
    url.searchParams.set("limit", "1000");
    if (cursor) url.searchParams.set("cursor", cursor);
    const page = await kalshiRequest(url, keyId, privateKey, fetchImpl);
    pages.push(page);
    cursor = nextCursor(page);
    if (cursor && seen.has(cursor)) break;
    if (cursor) seen.add(cursor);
  } while (cursor);

  return normalizeKalshiSnapshot(balance, pages);
}
