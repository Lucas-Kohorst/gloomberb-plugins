# Task 1: broker-kalshi

Read the spec first: `/Users/lucas/Desktop/Work/project/gloomberb-plugins/docs/superpowers/specs/2026-09-18-kalshi-broker-optic-odds-design.md`

Work directory: `/Users/lucas/Desktop/Work/project/gloomberb-plugins`

Create **only** `plugins/broker-kalshi/`. Do not edit README, other plugins, or commit.

## Pattern

Copy package.json + tsconfig from `plugins/broker-public`. Plugin shape from `plugins/broker-public/index.ts` plus `createConnection` / `withConnectionRequest` from `plugins/broker-robinhood/index.ts`.

## Files

- `package.json` name `gloomberb-broker-kalshi`, main `index.ts`
- `tsconfig.json`
- `auth.ts` / `auth.test.ts`
- `normalize.ts` / `normalize.test.ts`
- `client.ts`
- `index.ts`

## Auth

RSA-PSS SHA-256. Message = `timestampMillis + method + pathWithoutQuery`.
Headers: `KALSHI-ACCESS-KEY`, `KALSHI-ACCESS-TIMESTAMP`, `KALSHI-ACCESS-SIGNATURE`.

Export `signingMessage(timestampMs, method, pathWithOptionalQuery): string` that strips `?…`.
Test: `signingMessage("1703123456789", "GET", "/trade-api/v2/portfolio/orders?limit=5")` equals `1703123456789GET/trade-api/v2/portfolio/orders`.

Signing implementation may use `crypto.subtle` or Bun/node crypto. Tests must not need a live Kalshi key beyond a generated test key if you unit-test sign/roundtrip.

## Normalize (market_positions only)

`position_fp` is a **string** like `"10.00"` (negative = NO). Skip `== 0`.

| field | mapping |
| --- | --- |
| ticker | ticker |
| exchange | `"KALSHI"` |
| assetCategory | `"EVENT"` |
| shares | Number(position_fp) |
| side | long if shares > 0 else short |
| currency | USD |
| avgCost | market_exposure_dollars / abs(shares) if shares !== 0 |
| marketValue | Number(market_exposure_dollars) |
| accountId | `"kalshi"` |

Balance:

- `totalCashValue` / `settledCash` / `cashBalances[0]` ← Number(balance_dollars)
- `netLiquidation` ← portfolio_value / 100 (cents)
- `updatedAt` ← if updated_ts < 1e12 then * 1000 else as-is
- accountId `"kalshi"`, name `"Kalshi"`, currency USD

Paginate: join all pages of market_positions; ignore event_positions.

Fixture in tests must cover YES, NO, zero skipped, two pages concatenated.

## Client

`GET {base}/portfolio/balance` and `GET {base}/portfolio/positions?count_filter=position&limit=1000` + cursor.
Bases: production `https://external-api.kalshi.com/trade-api/v2`, demo `https://external-api.demo.kalshi.co/trade-api/v2`.
Inject fetch. 401/403 → `Kalshi rejected the API key. Check the Key ID and PEM; use a read-only key.`
Abort/timeout → short human sentence. Never log PEM/key/signature.

## Plugin

id `kalshi`, name Kalshi, version 1.0.0, toggleable, targets cli/tui/desktop.
Broker configSchema:
- keyId text required
- privateKey password required
- environment select production|demo default production

validate: both secrets non-empty.
importPortfolioSnapshot / importPositions / listAccounts from client+normalize.
getProfileActions: `{ id: "kalshi-open-pm", label: "Open in Prediction Markets", paneId: "prediction-markets" }`
No placeOrder/previewOrder/cancelOrder.

setup: capture ctx; `createConnection(ctx, { id: "kalshi-broker", name: "Kalshi Portfolio", kind: "broker", authRequired: true, priority: 410 })`.
Register a ticker action or command: set `prediction-markets:main` searchQuery to ticker, venueScope `"kalshi"`, selectedMarketKey null, `focusPane("prediction-markets")`. If that pane is missing, notify.

paneTemplates: id `kalshi-connect`, paneId `brokers`, shortcut `KLSH`, singleton, keywords kalshi/event/contracts/portfolio.

Preserve password on edit like SimpleFIN’s PRESERVED_PASSWORD_HINT if you need fromConfigValues.

## Verify

```
cd plugins/broker-kalshi && bun test
```

Write the report to `docs/superpowers/sdd/task-1-broker-kalshi-report.md` with status DONE|DONE_WITH_CONCERNS|BLOCKED, files created, test command output summary. Do not commit.
