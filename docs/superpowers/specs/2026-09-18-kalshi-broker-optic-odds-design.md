# Kalshi read-only broker + OpticOdds sports board

Two independent Gloomberb plugins in this repo. Thin v1 only: Kalshi portfolio sync, OpticOdds fixture odds. No trading, no Optic prediction-market endpoints, no SSE, no fills.

## Goal

- Sync a Kalshi account into Portfolio the way Public/Robinhood/IBKR do, using a read-only API key, and open a position in Prediction Markets.
- Show a sports odds board from OpticOdds, authenticated through BYOK.

## Non-goals (v1)

- Kalshi order preview/place/cancel, fills, settlements, subaccount picker.
- Mapping `event_positions` (aggregates; would double-count market rows).
- OpticOdds prediction-market, futures, parlay, injuries, grader, Copilot, or SSE stream.
- Fetching odds for every active fixture on each refresh.
- Storing Optic or Kalshi secrets in Gloom Cloud sync.

## Packages

| Package | Path | Plugin / broker id | Shortcut |
| --- | --- | --- | --- |
| Kalshi broker | `plugins/broker-kalshi` | `kalshi` | `KLSH` (Brokers pane, singleton) |
| OpticOdds | `plugins/optic-odds` | `optic-odds` | `ODDS` |

They do not import each other.

Targets: `cli`, `tui`, `desktop`. OpticOdds may add `web` only if Optic CORS allows browser calls; default is native-only until proven otherwise.

## Host dependency

`registerByokKnownService` is currently internal to Gloomberb. OpticOdds must appear in the BYOK picker, so this work includes a small fork change: export `registerByokKnownService` from `gloomberb/plugins` (or add `ctx.registerByokKnownService`). Without that export the plugin cannot register a known service and `ctx.getApiKey("optic-odds")` will not resolve a picker-created key.

Kalshi does not need that export.

## Kalshi broker

### Credentials

Stored on the broker instance, not BYOK:

- `keyId` (text, required) — Kalshi API Key ID.
- `privateKey` (password, required) — PEM private key.
- `environment` (select, default `production`) — `production` → `https://external-api.kalshi.com/trade-api/v2`; `demo` → `https://external-api.demo.kalshi.co/trade-api/v2`.

Use a read-only key (`read` / `read::portfolio_balance`). The adapter never calls write endpoints and does not implement `placeOrder` / `previewOrder` / `cancelOrder`.

### Auth

Every request: RSA-PSS signature of `timestamp + method + path` (path without query), headers `KALSHI-ACCESS-KEY`, `KALSHI-ACCESS-TIMESTAMP`, `KALSHI-ACCESS-SIGNATURE`. Native runtime only.

### Data

On sync:

1. `GET /portfolio/balance`
2. `GET /portfolio/positions?count_filter=position&limit=1000`, follow `cursor` until empty

Map **market_positions** only:

| Kalshi field | BrokerPosition |
| --- | --- |
| `ticker` | `ticker` |
| `"KALSHI"` | `exchange` |
| `"EVENT"` | `assetCategory` |
| `position_fp` (number) | `shares` (YES positive, NO negative) |
| sign of `position_fp` | `side` (`long` / `short`) |
| `"USD"` | `currency` |
| `market_exposure_dollars / abs(shares)` when shares ≠ 0 | `avgCost` |
| `market_exposure_dollars` | `marketValue` (cost basis; mark is a later addition) |
| `realized_pnl_dollars` | omitted in v1 (no mark price) |

One `BrokerAccount` (`accountId: "kalshi"`, name `"Kalshi"`):

- `totalCashValue` / `settledCash` / `cashBalances[0].quantity` ← `balance_dollars` (string dollars)
- `netLiquidation` ← `portfolio_value / 100` (`portfolio_value` is cents)
- `updatedAt` ← `updated_ts * 1000` if the timestamp is seconds; if it is already ms, use as-is (detect by magnitude in the normalizer)

Skip rows with `position_fp == 0`.

### Connections

Register connection `kalshi-broker` (kind `broker`, `authRequired: true`). Do not reuse id `kalshi`; Prediction Markets already owns that public market-data row.

Wrap fetches in `withConnectionRequest("kalshi-broker", ...)`.

### Open in Prediction Markets

Profile action and row open (`o` / ticker action if the host exposes one for broker positions):

```
ctx.resume.setPaneState("prediction-markets:main", "searchQuery", ticker)
ctx.resume.setPaneState("prediction-markets:main", "venueScope", "kalshi")
ctx.resume.setPaneState("prediction-markets:main", "selectedMarketKey", null)
ctx.focusPane("prediction-markets")
```

Same pattern as Adjacent. If Prediction Markets is disabled, notify and stop.

### Errors

401/403 → “Kalshi rejected the API key. Check the Key ID and PEM; use a read-only key.” Timeouts and network failures get a short human sentence. Never log PEM, key id, or signature.

## OpticOdds plugin

### Credentials (BYOK)

On `setup()`:

```
registerByokKnownService({
  id: "optic-odds",
  name: "OpticOdds",
  apiUrl: "https://api.opticodds.com/api/v3",
  authType: "header",
  authKey: "X-Api-Key",
  envVar: "OPTIC_ODDS_API_KEY",
  description: "Sportsbook odds, fixtures, and results.",
})
```

Resolve the secret only via `ctx.getApiKey("optic-odds")` (stored BYOK entry, then env). Send `X-Api-Key`. Never put the key in the query string, URLs, logs, or Cloud snapshots.

Connection `optic-odds` (kind `api`, `authRequired: true`). Missing key: empty state “Add an OpticOdds key in BYOK”. BYOK test can hit `GET /sports`.

### Pane

DataTable of active fixtures. Search filters team names. Segmented or select filter for sport, then league (options from `/leagues/active` and `/sports/active`). Default: all sports, all leagues, still **one list of fixtures**, not a full-odds firehose.

Columns:

- Start (UTC, formatted local)
- League
- Away
- Home
- ML (home/away American, main line)
- Spread (main)
- Total (main)
- Books (count of books that returned at least one of those markets)

`/` search, `[r]` refresh, `[o]` open.

### Fetch strategy

Optic `/fixtures/odds` allows at most 5 `fixture_id`s and 5 `sportsbook`s per request. v1:

1. `GET /fixtures/active` (and league/sport metadata) to build the table.
2. Pick a default 5-book basket from `/sportsbooks/active` (stable preference: DraftKings, FanDuel, BetMGM, Caesars, Pinnacle, then fill from whatever Optic marks active).
3. Fetch odds only for the **visible page** of fixtures (batch of 5), `is_main=true`, `odds_format=AMERICAN`, markets moneyline / spread / total (use Optic’s market ids).
4. Poll that visible window about every 30s while the pane is focused. Scrolling or filter changes schedule a new batch; in-flight requests abort.

Do not odds-fetch the entire active universe on refresh.

### Open

`o` on a selected fixture: first sportsbook desktop `deep_link` if present; otherwise no-op with a status hint. No invented Optic web URL.

### Errors

401/403 → “OpticOdds rejected the API key.” Rate limits: show the fixture list, leave odds cells empty, footer “odds delayed”. Never log the key.

## Testing seams

- Kalshi: parse balance + positions fixtures → `BrokerAccount` + `BrokerPosition[]` (including YES/NO sign, pagination cursor join, skip zero). Sign helper: known timestamp+path → expected message string (not a live private key).
- OpticOdds: fixture list + odds payload → table rows (main ML/spread/total, book count, missing odd → blank).
- BYOK: given a key, request headers include `X-Api-Key` and the URL has no `key` query param.

Tests use fixture JSON. No CI calls to Kalshi or Optic.

## Layout (suggested files)

```
plugins/broker-kalshi/
  index.ts          plugin + BrokerAdapter
  auth.ts           RSA-PSS headers
  client.ts         signed GET + pagination
  normalize.ts      API → broker snapshot
  normalize.test.ts
  auth.test.ts
  package.json

plugins/optic-odds/
  index.tsx         plugin, BYOK register, connection
  pane.tsx          table + filters
  client.ts         /sports /leagues /fixtures /odds batches
  normalize.ts      rows
  books.ts          default 5-book basket
  normalize.test.ts
  client.test.ts    URL/header construction
  package.json
```

Follow Public (`plugins/broker-public`) for the broker shape and Weather for the pane/connection shape.
