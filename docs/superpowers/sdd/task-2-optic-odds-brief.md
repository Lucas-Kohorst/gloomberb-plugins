# Task 2: optic-odds

Read the spec first: `/Users/lucas/Desktop/Work/project/gloomberb-plugins/docs/superpowers/specs/2026-09-18-kalshi-broker-optic-odds-design.md`

Work directory: `/Users/lucas/Desktop/Work/project/gloomberb-plugins`

Create **only** `plugins/optic-odds/`. Do not edit README, other plugins, or commit.

## Pattern

Copy package.json + tsconfig from `plugins/ofac-sanctions` (tsx plugin). Pane/table/search/refresh from OFAC (`plugins/ofac-sanctions/index.tsx`). Connection via `createConnection` from `gloomberb/plugins`.

## Files

- `package.json` name `gloomberb-optic-odds`, main `index.tsx`
- `tsconfig.json`
- `types.ts`
- `books.ts`
- `client.ts` / `client.test.ts`
- `normalize.ts` / `normalize.test.ts`
- `pane.tsx`
- `index.tsx`

## BYOK

On setup, try:

```ts
import { createConnection, registerByokKnownService } from "gloomberb/plugins";
```

If `registerByokKnownService` is not a typed export, add a local `gloomberb-plugins.d.ts` declaring it. Call it with:

```
{
  id: "optic-odds",
  name: "OpticOdds",
  apiUrl: "https://api.opticodds.com/api/v3",
  authType: "header",
  authKey: "X-Api-Key",
  envVar: "OPTIC_ODDS_API_KEY",
  description: "Sportsbook odds, fixtures, and results.",
}
```

All HTTP uses `ctx.getApiKey("optic-odds")`. Header `X-Api-Key`. **Never** add `key` query param.

`createConnection(ctx, { id: "optic-odds", name: "OpticOdds", kind: "api", authRequired: true, priority: 430 })`.

Missing key: pane EmptyState “Add an OpticOdds key in BYOK”.

## Client

Base `https://api.opticodds.com/api/v3`.

- GET `/sports/active`, `/leagues/active`, `/sportsbooks/active`, `/fixtures/active`
- GET `/fixtures/odds` with at most 5 fixture ids and 5 sportsbooks, `is_main=true`, `odds_format=AMERICAN`, markets moneyline/spread/total (pass Optic ids; if unknown use names Moneyline, Spread, Total)
- Repeat query params: `sportsbook=X&sportsbook=Y` not comma lists
- Odds only for a caller-supplied visible window of fixtures (chunks of 5), not the whole universe
- 401/403 → `OpticOdds rejected the API key.`
- Rate limit: throw a typed/delay error the pane can catch to keep rows and show footer “odds delayed”
- Inject fetch + apiKey. Tests: built URL has `X-Api-Key` header, URL searchParams has no `key`

## books.ts

`pickBookBasket(activeBooks: {id:string, name?:string}[]): string[]` max 5.
Prefer in order: DraftKings, FanDuel, BetMGM, Caesars, Pinnacle (match id or name case-insensitive), then fill from remaining active. Test this.

## Normalize

One row per fixture:

- id, start (ISO), league name, away, home
- mlHome/mlAway American mains (blank if missing)
- spread: main home line + price, e.g. `-3.5 (-110)` or structured fields
- total: main over/under `o 46.5 (-110)` style
- bookCount: number of distinct sportsbooks that returned at least one of those mains
- openUrl: first odd’s `deep_link.desktop` if present, else null

Test with a fixture JSON like Optic’s `/fixtures/odds` sample (Astros/Royals style) plus a fixture with no odds (blanks, bookCount 0).

## Pane

id `optic-odds`, name OpticOdds, shortcut `ODDS`, floating ~100x30.
DataTable (DataTableView or DataTableStackView) of rows.
Search `/` filters team names.
Sport then league filters from active lists. Default all.
`r` refresh. `o` opens `openUrl` via `openUrl` from `gloomberb/components`; if null, status hint “No sportsbook link”.
Poll visible odds ~30s while focused (`useAutoRefresh`). Abort in-flight on filter/scroll/unmount.
usePluginPaneState for query/selectedIdx.

Plugin id `optic-odds`, toggleable, homepage github Lucas-Kohorst/gloomberb-plugins.

## Verify

```
cd plugins/optic-odds && bun test
```

Write `docs/superpowers/sdd/task-2-optic-odds-report.md` with status, files, test summary. Do not commit.
