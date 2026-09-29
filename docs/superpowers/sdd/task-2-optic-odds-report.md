# Task 2 report: optic-odds

## Status

**DONE_WITH_CONCERNS**

No commit (task forbids it).

## Files

Created only under `plugins/optic-odds/`:

- `package.json` — name `gloomberb-optic-odds`, main `index.tsx`
- `tsconfig.json` — OFAC copy, plus `*.d.ts` include for the local BYOK declaration
- `gloomberb-plugins.d.ts` — declares `registerByokKnownService` and `GloomPluginContext.getApiKey`
- `types.ts`
- `books.ts` / `books.test.ts`
- `client.ts` / `client.test.ts`
- `normalize.ts` / `normalize.test.ts`
- `pane.tsx`
- `index.tsx`

## What shipped

- Plugin id `optic-odds`, toggleable, targets `cli`/`tui`/`desktop`, homepage `https://github.com/Lucas-Kohorst/gloomberb-plugins`.
- Pane id `optic-odds`, name OpticOdds, shortcut `ODDS`, floating `100x30`.
- `setup()` registers BYOK with the spec-exact service object and `createConnection(ctx, { id: "optic-odds", name: "OpticOdds", kind: "api", authRequired: true, priority: 430 })`.
- All HTTP goes through `ctx.getApiKey("optic-odds")` → `X-Api-Key` header. No `key` query param.
- Client: `/sports/active`, `/leagues/active`, `/sportsbooks/active`, `/fixtures/active`, `/fixtures/odds` with repeated params, max 5 fixtures/books, `is_main=true`, `odds_format=AMERICAN`, markets Moneyline/Spread/Total.
- 401/403 → `OpticOddsAuthError` `"OpticOdds rejected the API key."`
- 429 → `OpticOddsRateLimitError`; pane keeps fixture rows and shows footer `"odds delayed"`.
- `pickBookBasket`: DraftKings, FanDuel, BetMGM, Caesars, Pinnacle, then fill, max 5.
- One row per fixture: ISO start, league, away/home, American ML, spread `-1.5 (-110)`, total `o 8.5 (-105)`, bookCount, first `deep_link.desktop`.
- Missing key EmptyState: `"Add an OpticOdds key in BYOK"`.
- DataTableView with sport then league tabs (default all), `/` team search, `r` refresh, `o` opens sportsbook link or footer `"No sportsbook link"`.
- Visible odds in chunks of 5 from the selected-row page; in-flight odds abort on filter/selection-page/unmount; `useAutoRefresh(..., 0.5)` while focused.

## Tests

Command: `bun test /Users/lucas/Desktop/Work/project/gloomberb-plugins/plugins/optic-odds`

```
10 pass, 0 fail, 25 expect() calls, 3 files
```

- Client: `X-Api-Key` present, no `key` query, 401/403 sentence, 429 typed error, repeated odds params capped at 5.
- Books: preferred order, case-insensitive id/name match, fill remaining, fewer than 5.
- Normalize: Astros/Royals sample (ML/spread/total/bookCount/openUrl) and a no-odds fixture (blanks, bookCount 0).

TDD: client header test was red (missing module), then 401/429/odds-URL tests were red, then book-basket and normalize tests were red, then implementation.

## Concerns

1. **Host export still required.** `registerByokKnownService` is only a local `.d.ts` plus an import. Until Gloomberb actually exports it, BYOK picker registration will fail at runtime even though `ctx.getApiKey("optic-odds")` is wired.
2. **Visible window is selection-paged, not a virtualizer viewport.** Odds fetch the 5-fixture page containing `selectedIdx`. Keyboard/selection moves the window; pixel-scroll without changing selection does not.
3. **30s poll uses `useAutoRefresh(..., 0.5)`.** That matches other plugins’ minutes argument only if fractional minutes are honored. If the host truncates to an integer, polling becomes 0 or 60s.
4. **Key appearance may need a pane remount.** `getApiKey` is read on render from the `setup()` context. Adding a BYOK key while the empty state is showing will not by itself re-render the pane.
5. **Market ids are names.** Requests send `Moneyline`, `Spread`, `Total` (allowed when Optic ids are unknown). Optic may expect ids such as `point_spread` / `total_points`.
6. **`cd plugins/optic-odds && bun test` is workspace-wide.** Bun workspaces still execute sibling plugin tests. Scoped path `bun test plugins/optic-odds` is the optic-odds-only run.

## Commits

none
