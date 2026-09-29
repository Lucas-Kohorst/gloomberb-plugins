import { OPTIC_ODDS_API_BASE, OPTIC_ODDS_ODDS_CHUNK } from "./types";

export class OpticOddsAuthError extends Error {
  constructor(message = "OpticOdds rejected the API key.") {
    super(message);
    this.name = "OpticOddsAuthError";
  }
}

export class OpticOddsRateLimitError extends Error {
  constructor(message = "odds delayed") {
    super(message);
    this.name = "OpticOddsRateLimitError";
  }
}

type FetchLike = typeof fetch;

export interface OpticOddsClientOptions {
  apiKey: string;
  fetch?: FetchLike;
}

const DEFAULT_MARKETS = ["moneyline", "point_spread", "total_points"];

function appendRepeated(params: URLSearchParams, key: string, values: string[]): void {
  for (const value of values) {
    if (value) params.append(key, value);
  }
}

export class OpticOddsClient {
  private readonly apiKey: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: OpticOddsClientOptions) {
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetch ?? fetch;
  }

  fetchSports(signal?: AbortSignal): Promise<unknown> {
    return this.get("/sports/active", undefined, signal);
  }

  fetchLeagues(sport?: string, signal?: AbortSignal): Promise<unknown> {
    const params = new URLSearchParams();
    if (sport) params.set("sport", sport);
    return this.get("/leagues/active", sport ? params : undefined, signal);
  }

  fetchSportsbooks(signal?: AbortSignal): Promise<unknown> {
    return this.get("/sportsbooks/active", undefined, signal);
  }

  fetchFixtures(filters: { sport: string; league?: string }, signal?: AbortSignal): Promise<unknown> {
    const params = new URLSearchParams();
    params.set("sport", filters.sport);
    if (filters.league) params.set("league", filters.league);
    return this.get("/fixtures/active", params, signal);
  }

  fetchOdds(
    args: {
      fixtureIds: string[];
      sportsbooks: string[];
      markets?: string[];
    },
    signal?: AbortSignal,
  ): Promise<unknown> {
    const params = new URLSearchParams();
    appendRepeated(params, "fixture_id", args.fixtureIds.slice(0, OPTIC_ODDS_ODDS_CHUNK));
    appendRepeated(params, "sportsbook", args.sportsbooks.slice(0, OPTIC_ODDS_ODDS_CHUNK));
    appendRepeated(params, "market", args.markets && args.markets.length > 0 ? args.markets : DEFAULT_MARKETS);
    params.set("is_main", "true");
    params.set("odds_format", "AMERICAN");
    return this.get("/fixtures/odds", params, signal);
  }

  private async get(path: string, params?: URLSearchParams, signal?: AbortSignal): Promise<unknown> {
    const url = new URL(`${OPTIC_ODDS_API_BASE}${path}`);
    if (params) {
      for (const [key, value] of params) {
        url.searchParams.append(key, value);
      }
    }
    const response = await this.fetchImpl(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Api-Key": this.apiKey,
      },
      signal,
    });
    if (response.status === 401 || response.status === 403) {
      throw new OpticOddsAuthError();
    }
    if (response.status === 429) {
      throw new OpticOddsRateLimitError();
    }
    if (!response.ok) {
      throw new Error(await opticOddsHttpError(response));
    }
    return await response.json();
  }
}

async function opticOddsHttpError(response: Response): Promise<string> {
  const fallback = `OpticOdds request failed (${response.status}).`;
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string") {
      return `OpticOdds request failed (${response.status}): ${(body as { error: string }).error}`;
    }
  } catch {
    // Keep the status-only fallback when the body is not JSON.
  }
  return fallback;
}
