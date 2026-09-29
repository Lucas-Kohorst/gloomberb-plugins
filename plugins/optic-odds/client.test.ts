import { describe, expect, test } from "bun:test";
import { OpticOddsAuthError, OpticOddsClient, OpticOddsRateLimitError } from "./client";

const API_KEY = "test-optic-key";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function captureFetch() {
  const calls: Array<{ url: URL; headers: Headers }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url, headers: new Headers(init?.headers) });
    return jsonResponse({ data: [] });
  };
  return { calls, fetchImpl };
}

describe("OpticOdds client auth", () => {
  test("surfaces OpticOdds JSON error bodies on 400", async () => {
    const fetchImpl: typeof fetch = async () => jsonResponse({ error: "sport is required" }, 400);
    const client = new OpticOddsClient({ apiKey: API_KEY, fetch: fetchImpl });
    let thrown: unknown;
    try {
      await client.fetchSports();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown instanceof Error ? thrown.message : "").toBe(
      "OpticOdds request failed (400): sport is required",
    );
  });

  test("sends X-Api-Key header and never a key query param", async () => {
    const { calls, fetchImpl } = captureFetch();
    const client = new OpticOddsClient({ apiKey: API_KEY, fetch: fetchImpl });
    await client.fetchSports();

    expect(calls).toHaveLength(1);
    expect(calls[0]!.headers.get("X-Api-Key")).toBe(API_KEY);
    expect(calls[0]!.url.searchParams.has("key")).toBe(false);
    expect(calls[0]!.url.pathname).toBe("/api/v3/sports/active");
  });

  test("401 and 403 become OpticOdds rejected the API key", async () => {
    for (const status of [401, 403]) {
      const fetchImpl: typeof fetch = async () => jsonResponse({}, status);
      const client = new OpticOddsClient({ apiKey: API_KEY, fetch: fetchImpl });
      let thrown: unknown;
      try {
        await client.fetchSports();
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(OpticOddsAuthError);
      expect(thrown instanceof Error ? thrown.message : "").toBe("OpticOdds rejected the API key.");
    }
  });

  test("429 throws a rate-limit error the pane can keep rows for", async () => {
    const fetchImpl: typeof fetch = async () => jsonResponse({}, 429);
    const client = new OpticOddsClient({ apiKey: API_KEY, fetch: fetchImpl });
    let thrown: unknown;
    try {
      await client.fetchOdds({
        fixtureIds: ["fix-1"],
        sportsbooks: ["draftkings"],
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(OpticOddsRateLimitError);
  });
});

describe("OpticOdds odds request", () => {
  test("repeats fixture and sportsbook params and never a key query", async () => {
    const { calls, fetchImpl } = captureFetch();
    const client = new OpticOddsClient({ apiKey: API_KEY, fetch: fetchImpl });
    await client.fetchOdds({
      fixtureIds: ["f1", "f2", "f3", "f4", "f5", "f6"],
      sportsbooks: ["draftkings", "fanduel", "betmgm", "caesars", "pinnacle", "bet365"],
    });

    expect(calls).toHaveLength(1);
    const url = calls[0]!.url;
    expect(url.pathname).toBe("/api/v3/fixtures/odds");
    expect(calls[0]!.headers.get("X-Api-Key")).toBe(API_KEY);
    expect(url.searchParams.has("key")).toBe(false);
    expect(url.searchParams.getAll("fixture_id")).toEqual(["f1", "f2", "f3", "f4", "f5"]);
    expect(url.searchParams.getAll("sportsbook")).toEqual([
      "draftkings",
      "fanduel",
      "betmgm",
      "caesars",
      "pinnacle",
    ]);
    expect(url.searchParams.get("sportsbook")).not.toContain(",");
    expect(url.searchParams.get("is_main")).toBe("true");
    expect(url.searchParams.get("odds_format")).toBe("AMERICAN");
    expect(url.searchParams.getAll("market")).toEqual(["moneyline", "point_spread", "total_points"]);
  });
});
