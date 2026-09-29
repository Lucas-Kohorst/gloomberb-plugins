# Task 1: broker-kalshi — report

**Status:** DONE_WITH_CONCERNS  
**Commits:** none (not requested)

## Files created

All under `plugins/broker-kalshi/`:

- `package.json` — name `gloomberb-broker-kalshi`, main `index.ts`
- `tsconfig.json` — copied from `plugins/broker-public`
- `auth.ts` / `auth.test.ts` — RSA-PSS SHA-256; `signingMessage` strips `?…`
- `normalize.ts` / `normalize.test.ts` — `market_positions` only; YES/NO/zero/pages fixture
- `client.ts` / `client.test.ts` — injected fetch, pagination, 401/403/timeout
- `index.ts` — plugin + `kalshiBroker`

## Behavior

- Auth message is `timestampMillis + method + pathWithoutQuery`. Headers: `KALSHI-ACCESS-KEY`, `KALSHI-ACCESS-TIMESTAMP`, `KALSHI-ACCESS-SIGNATURE`.
- Positions: `position_fp` string → signed `shares`; skip `== 0`; `side` long/short; `exchange` `KALSHI`; `assetCategory` `EVENT`; `accountId` `kalshi`. Event positions ignored. Pages concatenated.
- Balance: `balance_dollars` → cash fields; `portfolio_value / 100`; `updated_ts` seconds vs ms by magnitude.
- Client: production `https://external-api.kalshi.com/trade-api/v2`, demo `https://external-api.demo.kalshi.co/trade-api/v2`. `GET /portfolio/balance` and `GET /portfolio/positions?count_filter=position&limit=1000` + cursor.
- 401/403 → `Kalshi rejected the API key. Check the Key ID and PEM; use a read-only key.` Abort → `Kalshi took too long to respond.` Network → `Gloomberb could not reach Kalshi.` No PEM/key/signature logging.
- Plugin id `kalshi`, connection `kalshi-broker` (kind `broker`, `authRequired: true`, priority `410`, name `Kalshi Portfolio`). Config: `keyId`, `privateKey`, `environment` production|demo. Password preserved via SimpleFIN hint. No order methods.
- Profile action `{ id: "kalshi-open-pm", label: "Open in Prediction Markets", paneId: "prediction-markets" }`. Ticker action/command seeds `prediction-markets:main` (`searchQuery`, `venueScope: "kalshi"`, `selectedMarketKey: null`) and `focusPane("prediction-markets")`; missing pane notifies.
- Pane template `kalshi-connect`, paneId `brokers`, shortcut `KLSH`, singleton, keywords kalshi/event/contracts/portfolio.

## Tests

Scoped (this package):

```
cd /Users/lucas/Desktop/Work/project/gloomberb-plugins
bun test plugins/broker-kalshi
```

```
bun test v1.4.0 (34cbb9a40)

plugins/broker-kalshi/auth.test.ts:
(pass) signingMessage > strips the query string from the signed path
(pass) kalshiAuthHeaders > RSA-PSS SHA-256 signature verifies against the signing message

plugins/broker-kalshi/normalize.test.ts:
(pass) normalizeKalshiSnapshot > maps YES and NO market positions, skips zeros, and concatenates pages
(pass) normalizeKalshiSnapshot > maps cash, portfolio value in cents, and second timestamps
(pass) normalizeKalshiSnapshot > keeps millisecond updated_ts as-is

plugins/broker-kalshi/client.test.ts:
(pass) loadKalshiPortfolio > signs requests, paginates market_positions, and skips zeros and event_positions
(pass) loadKalshiPortfolio > uses the demo API base
(pass) loadKalshiPortfolio > maps 401 to the rejected-key sentence
(pass) loadKalshiPortfolio > maps 403 to the rejected-key sentence without leaking credentials
(pass) loadKalshiPortfolio > maps abort/timeout to a short human sentence
(pass) loadKalshiPortfolio > maps network failure to a short human sentence

 11 pass
 0 fail
 39 expect() calls
Ran 11 tests across 3 files. [128.00ms]
```

Brief verify command `cd plugins/broker-kalshi && bun test` is workspace-wide in this repo (Bun walks to the workspace root) and currently fails on unrelated packages (`plugins/optic-odds/books.test.ts` missing `./books`; weather ASOS). Kalshi files themselves are green.

## Concerns

1. **Verify command is workspace-wide.** `cd plugins/broker-kalshi && bun test` does not isolate this package; use `bun test plugins/broker-kalshi` from the repo root until a workspace bunfig exists (out of scope for this task).
2. **Ticker action is exchange-gated.** Open-in-PM ticker action runs only when `metadata.exchange === "KALSHI"`. If the host copies positions without that exchange, the command (ticker arg) still works; the ticker action will not.
3. **No live Kalshi call.** Auth roundtrip uses a generated RSA key; HTTP is injected. Signing algorithm matches RSA-PSS SHA-256 / digest salt length, not a production Key ID.
