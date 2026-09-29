import { describe, expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { KALSHI_API_BASES, loadKalshiPortfolio } from "./client";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const keyId = "test-key-id";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function captureFetch(handler: (url: URL, headers: Headers) => Response | Promise<Response>) {
  const calls: Array<{ url: URL; headers: Headers }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    calls.push({ url, headers });
    return handler(url, headers);
  };
  return { calls, fetchImpl };
}

const yesPosition = {
  ticker: "KXHIGHNY-25SEP18-T82",
  position_fp: "10.00",
  market_exposure_dollars: "25.00",
};

const noPosition = {
  ticker: "INXD-25DEC31-T5000",
  position_fp: "-5.00",
  market_exposure_dollars: "12.50",
};

const zeroPosition = {
  ticker: "SKIP-ZERO",
  position_fp: "0.00",
  market_exposure_dollars: "0.00",
};

const balance = {
  balance_dollars: "150.00",
  portfolio_value: 25000,
  updated_ts: 1_703_123_456,
};

describe("loadKalshiPortfolio", () => {
  test("signs requests, paginates market_positions, and skips zeros and event_positions", async () => {
    const { calls, fetchImpl } = captureFetch((url) => {
      if (url.pathname.endsWith("/portfolio/balance")) return jsonResponse(balance);
      if (url.searchParams.get("cursor") === "page-2") {
        return jsonResponse({
          market_positions: [noPosition],
          event_positions: [],
          cursor: "",
        });
      }
      return jsonResponse({
        market_positions: [yesPosition, zeroPosition],
        event_positions: [{
          event_ticker: "KXHIGHNY-25SEP18",
          position_fp: "99.00",
          market_exposure_dollars: "999.00",
        }],
        cursor: "page-2",
      });
    });

    const snapshot = await loadKalshiPortfolio({ keyId, privateKey: pem, fetchImpl });

    expect(calls).toHaveLength(3);
    expect(calls[0]!.url.href).toBe(`${KALSHI_API_BASES.production}/portfolio/balance`);
    expect(calls[1]!.url.pathname).toBe("/trade-api/v2/portfolio/positions");
    expect(calls[1]!.url.searchParams.get("count_filter")).toBe("position");
    expect(calls[1]!.url.searchParams.get("limit")).toBe("1000");
    expect(calls[2]!.url.searchParams.get("cursor")).toBe("page-2");

    for (const call of calls) {
      expect(call.headers.get("KALSHI-ACCESS-KEY")).toBe(keyId);
      expect(call.headers.get("KALSHI-ACCESS-TIMESTAMP")).toBeTruthy();
      expect(call.headers.get("KALSHI-ACCESS-SIGNATURE")).toBeTruthy();
    }

    expect(snapshot.positions.map((position) => position.ticker)).toEqual([
      "KXHIGHNY-25SEP18-T82",
      "INXD-25DEC31-T5000",
    ]);
    expect(snapshot.positions[0]?.shares).toBe(10);
    expect(snapshot.positions[0]?.side).toBe("long");
    expect(snapshot.positions[1]?.shares).toBe(-5);
    expect(snapshot.positions[1]?.side).toBe("short");
  });

  test("uses the demo API base", async () => {
    const { calls, fetchImpl } = captureFetch((url) => {
      if (url.pathname.endsWith("/portfolio/balance")) return jsonResponse(balance);
      return jsonResponse({ market_positions: [], cursor: "" });
    });

    await loadKalshiPortfolio({
      keyId,
      privateKey: pem,
      environment: "demo",
      fetchImpl,
    });

    expect(calls[0]!.url.origin).toBe("https://external-api.demo.kalshi.co");
    expect(calls[0]!.url.href.startsWith(KALSHI_API_BASES.demo)).toBe(true);
  });

  test("maps 401 to the rejected-key sentence", async () => {
    const { fetchImpl } = captureFetch(() => jsonResponse({ error: "unauthorized" }, 401));
    expect(loadKalshiPortfolio({ keyId, privateKey: pem, fetchImpl })).rejects.toThrow(
      "Kalshi rejected the API key. Check the Key ID and PEM; use a read-only key.",
    );
  });

  test("maps 403 to the rejected-key sentence without leaking credentials", async () => {
    const { fetchImpl } = captureFetch(() => jsonResponse({ error: "forbidden" }, 403));
    try {
      await loadKalshiPortfolio({ keyId, privateKey: pem, fetchImpl });
      throw new Error("expected rejection");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toBe("Kalshi rejected the API key. Check the Key ID and PEM; use a read-only key.");
      expect(message).not.toContain(keyId);
      expect(message).not.toContain("BEGIN");
      expect(message).not.toContain(pem.slice(0, 40));
    }
  });

  test("maps abort/timeout to a short human sentence", async () => {
    const fetchImpl: typeof fetch = async () => {
      const error = new Error("The operation was aborted.");
      error.name = "AbortError";
      throw error;
    };
    expect(loadKalshiPortfolio({ keyId, privateKey: pem, fetchImpl })).rejects.toThrow(
      "Kalshi took too long to respond.",
    );
  });

  test("maps network failure to a short human sentence", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error("connect ECONNREFUSED");
    };
    expect(loadKalshiPortfolio({ keyId, privateKey: pem, fetchImpl })).rejects.toThrow(
      "Gloomberb could not reach Kalshi.",
    );
  });
});
