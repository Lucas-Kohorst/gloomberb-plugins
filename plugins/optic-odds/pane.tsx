import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, type InputRenderable } from "gloomberb/ui";
import {
  DataTableView,
  EmptyState,
  InputSearchBar,
  Spinner,
  Tabs,
  openUrl,
  useUpdatedAgo,
  type DataTableCell,
  type DataTableColumn,
  type DataTableKeyEvent,
  type DataTableRootKeyContext,
  type PaneFooterSegment,
} from "gloomberb/components";
import type { GloomPluginContext, PaneProps } from "gloomberb/types/plugin";
import {
  paneRefreshHint,
  paneSearchHint,
  usePaneStatusLinkFooter,
  usePluginPaneState,
  useShortcut,
} from "gloomberb/react";
import { colors } from "gloomberb/theme";
import { httpFetch, isPlainArrowUp, isPlainKey, stopSearchFocusNavigation } from "gloomberb/utils";
import { withConnectionRequest } from "gloomberb/plugins";
import { pickBookBasket } from "./books";
import { OpticOddsAuthError, OpticOddsClient, OpticOddsRateLimitError } from "./client";
import {
  normalizeFixtureRows,
  parseNamedEntities,
} from "./normalize";
import {
  OPTIC_ODDS_CONNECTION_ID,
  OPTIC_ODDS_ODDS_CHUNK,
  OPTIC_ODDS_PLUGIN_ID,
  type FixtureRow,
  type OpticNamedEntity,
} from "./types";

const ODDS_POLL_MS = 30_000;
const ALL_FILTER = "all";
const PREFERRED_SPORTS = ["football", "american_football", "basketball", "baseball", "hockey", "soccer"];

function pickDefaultSport(sports: OpticNamedEntity[]): string | null {
  for (const id of PREFERRED_SPORTS) {
    if (sports.some((sport) => sport.id === id)) return id;
  }
  return sports[0]?.id ?? null;
}

type OddsColumnId = "start" | "league" | "away" | "home" | "ml" | "spread" | "total" | "books";
type OddsColumn = DataTableColumn & { id: OddsColumnId };

let pluginContext: GloomPluginContext | null = null;

export function bindOpticOddsContext(ctx: GloomPluginContext | null): void {
  pluginContext = ctx;
}

function readApiKey(): string {
  const key = pluginContext?.getApiKey("optic-odds");
  if (typeof key === "string" && key.trim()) return key.trim();
  const env = process.env.OPTIC_ODDS_API_KEY;
  return typeof env === "string" ? env.trim() : "";
}

function connected<T>(operation: string, run: () => Promise<T>): Promise<T> {
  return withConnectionRequest(OPTIC_ODDS_CONNECTION_ID, operation, run);
}

function matchesTeamSearch(row: FixtureRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return row.home.toLowerCase().includes(needle) || row.away.toLowerCase().includes(needle);
}

function oddsWindowIds(rows: FixtureRow[], selectedIdx: number): string[] {
  if (rows.length === 0) return [];
  const clamped = Math.max(0, Math.min(selectedIdx, rows.length - 1));
  const start = Math.floor(clamped / OPTIC_ODDS_ODDS_CHUNK) * OPTIC_ODDS_ODDS_CHUNK;
  return rows.slice(start, start + OPTIC_ODDS_ODDS_CHUNK).map((row) => row.id);
}

function formatStart(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatMl(row: FixtureRow): string {
  if (!row.mlHome && !row.mlAway) return "";
  return `${row.mlHome || "—"} / ${row.mlAway || "—"}`;
}

function applyOdds(rows: FixtureRow[], payload: unknown): FixtureRow[] {
  const byId = new Map<string, FixtureRow>();
  for (const row of normalizeFixtureRows(payload)) byId.set(row.id, row);
  return rows.map((row) => {
    const next = byId.get(row.id);
    if (!next) return row;
    return {
      ...row,
      mlHome: next.mlHome,
      mlAway: next.mlAway,
      spread: next.spread,
      total: next.total,
      bookCount: next.bookCount,
      openUrl: next.openUrl,
    };
  });
}

const COLUMNS: OddsColumn[] = [
  { id: "start", label: "START", width: 14, align: "left" },
  { id: "league", label: "LEAGUE", width: 8, align: "left" },
  { id: "away", label: "AWAY", width: 16, align: "left", flexGrow: 1 },
  { id: "home", label: "HOME", width: 16, align: "left", flexGrow: 1 },
  { id: "ml", label: "ML", width: 16, align: "right" },
  { id: "spread", label: "SPREAD", width: 14, align: "right" },
  { id: "total", label: "TOTAL", width: 16, align: "right" },
  { id: "books", label: "BOOKS", width: 6, align: "right" },
];

function renderCell(row: FixtureRow, column: OddsColumn, selected: boolean): DataTableCell {
  const color = selected ? colors.selectedText : colors.text;
  const dim = selected ? colors.selectedText : colors.textDim;
  switch (column.id) {
    case "start":
      return { text: formatStart(row.start), color: dim };
    case "league":
      return { text: row.league || "—", color: dim };
    case "away":
      return { text: row.away, color };
    case "home":
      return { text: row.home, color };
    case "ml":
      return { text: formatMl(row) || "—", color: formatMl(row) ? color : dim };
    case "spread":
      return { text: row.spread || "—", color: row.spread ? color : dim };
    case "total":
      return { text: row.total || "—", color: row.total ? color : dim };
    case "books":
      return { text: String(row.bookCount), color: dim };
  }
}

function loadErrorMessage(error: unknown): string {
  if (error instanceof OpticOddsAuthError) return error.message;
  if (error instanceof Error && error.message.trim()) return error.message;
  return "OpticOdds request failed.";
}

export function OpticOddsPane({ paneId, focused, width, height }: PaneProps) {
  const apiKey = readApiKey();
  const [query, setQuery] = usePluginPaneState("query", "");
  const [selectedIdx, setSelectedIdx] = usePluginPaneState("selectedIdx", 0);
  const [sportId, setSportId] = useState(ALL_FILTER);
  const [leagueId, setLeagueId] = useState(ALL_FILTER);
  const [sports, setSports] = useState<OpticNamedEntity[]>([]);
  const [leagues, setLeagues] = useState<OpticNamedEntity[]>([]);
  const [books, setBooks] = useState<string[]>([]);
  const [rows, setRows] = useState<FixtureRow[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [oddsDelayed, setOddsDelayed] = useState(false);
  const [linkHint, setLinkHint] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchFocusToken, setSearchFocusToken] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const searchInputRef = useRef<InputRenderable | null>(null);
  const fixturesAbort = useRef<AbortController | null>(null);
  const oddsAbort = useRef<AbortController | null>(null);
  const fixturesGen = useRef(0);
  const oddsGen = useRef(0);

  const client = useMemo(() => {
    if (!apiKey) return null;
    return new OpticOddsClient({ apiKey, fetch: httpFetch });
  }, [apiKey]);

  const visibleLeagues = useMemo(() => {
    if (sportId === ALL_FILTER) return leagues;
    return leagues.filter((league) => !league.sportId || league.sportId === sportId);
  }, [leagues, sportId]);

  const filtered = useMemo(
    () => rows.filter((row) => matchesTeamSearch(row, query)),
    [query, rows],
  );

  useEffect(() => {
    if (filtered.length === 0) {
      if (selectedIdx !== 0) setSelectedIdx(0);
      return;
    }
    if (selectedIdx < 0 || selectedIdx >= filtered.length) setSelectedIdx(0);
  }, [filtered, selectedIdx, setSelectedIdx]);

  const selected = filtered[selectedIdx] ?? null;
  const windowKey = oddsWindowIds(filtered, selectedIdx).join(",");

  const loadOdds = useCallback(async (fixtureIds: string[], currentClient: OpticOddsClient, currentBooks: string[]) => {
    if (fixtureIds.length === 0 || currentBooks.length === 0) return;
    oddsAbort.current?.abort();
    const controller = new AbortController();
    oddsAbort.current = controller;
    const gen = ++oddsGen.current;
    try {
      const payload = await connected("odds", () => currentClient.fetchOdds({
        fixtureIds,
        sportsbooks: currentBooks,
      }, controller.signal));
      if (oddsGen.current !== gen || controller.signal.aborted) return;
      setRows((current) => applyOdds(current, payload));
      setOddsDelayed(false);
      setLastUpdated(Date.now());
    } catch (loadError) {
      if (oddsGen.current !== gen || controller.signal.aborted) return;
      if (loadError instanceof Error && loadError.name === "AbortError") return;
      if (loadError instanceof OpticOddsRateLimitError) {
        setOddsDelayed(true);
        return;
      }
      setError(loadErrorMessage(loadError));
    }
  }, []);

  const loadCatalogAndFixtures = useCallback((currentClient: OpticOddsClient, nextSport: string, nextLeague: string) => {
    fixturesAbort.current?.abort();
    oddsAbort.current?.abort();
    const controller = new AbortController();
    fixturesAbort.current = controller;
    const gen = ++fixturesGen.current;
    setStatus("loading");
    setError(null);
    setOddsDelayed(false);
    void (async () => {
      try {
        const sportsPayload = await connected("sports", () => currentClient.fetchSports(controller.signal));
        if (fixturesGen.current !== gen || controller.signal.aborted) return;
        const nextSports = parseNamedEntities(sportsPayload);
        const sport = nextSport === ALL_FILTER ? pickDefaultSport(nextSports) : nextSport;
        if (!sport) throw new Error("OpticOdds returned no active sports.");
        if (sport !== nextSport) setSportId(sport);
        const [leaguesPayload, booksPayload, fixturesPayload] = await Promise.all([
          connected("leagues", () => currentClient.fetchLeagues(sport, controller.signal)),
          connected("sportsbooks", () => currentClient.fetchSportsbooks(controller.signal)),
          connected("fixtures", () => currentClient.fetchFixtures({
            sport,
            league: nextLeague === ALL_FILTER ? undefined : nextLeague,
          }, controller.signal)),
        ]);
        if (fixturesGen.current !== gen || controller.signal.aborted) return;
        const nextLeagues = parseNamedEntities(leaguesPayload);
        const nextBooks = pickBookBasket(parseNamedEntities(booksPayload));
        const nextRows = normalizeFixtureRows(fixturesPayload);
        setSports(nextSports);
        setLeagues(nextLeagues);
        setBooks(nextBooks);
        setRows(nextRows);
        setStatus("loaded");
        setLastUpdated(Date.now());
      } catch (loadError) {
        if (fixturesGen.current !== gen || controller.signal.aborted) return;
        if (loadError instanceof Error && loadError.name === "AbortError") return;
        setStatus("error");
        setError(loadErrorMessage(loadError));
        if (!(loadError instanceof OpticOddsRateLimitError)) setRows([]);
        else setOddsDelayed(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!client) return;
    loadCatalogAndFixtures(client, sportId, leagueId);
  }, [client, loadCatalogAndFixtures, leagueId, sportId]);

  useEffect(() => () => {
    fixturesAbort.current?.abort();
    oddsAbort.current?.abort();
  }, []);

  useEffect(() => {
    if (!client || status !== "loaded") return;
    const ids = windowKey ? windowKey.split(",") : [];
    void loadOdds(ids, client, books);
  }, [books, client, loadOdds, status, windowKey]);

  const refreshOdds = useCallback(() => {
    if (!client) return;
    void loadOdds(oddsWindowIds(filtered, selectedIdx), client, books);
  }, [books, client, filtered, loadOdds, selectedIdx]);

  const refreshAll = useCallback(() => {
    if (!client) return;
    loadCatalogAndFixtures(client, sportId, leagueId);
  }, [client, loadCatalogAndFixtures, leagueId, sportId]);

  useEffect(() => {
    if (!focused || status !== "loaded") return;
    const timer = setInterval(() => {
      refreshOdds();
    }, ODDS_POLL_MS);
    return () => clearInterval(timer);
  }, [focused, refreshOdds, status]);

  const focusSearch = useCallback(() => {
    setSearchFocused(true);
    setSearchFocusToken((token) => token + 1);
  }, []);

  const updateQuery = useCallback((value: string) => {
    setQuery(value);
    setSelectedIdx(0);
  }, [setQuery, setSelectedIdx]);

  const openSelected = useCallback(() => {
    if (selected?.openUrl) {
      setLinkHint(null);
      openUrl(selected.openUrl);
      return;
    }
    setLinkHint("No sportsbook link");
  }, [selected]);

  useShortcut((event) => {
    if (!focused) return;
    if (searchFocused) {
      if (isPlainKey(event, "escape")) {
        event.stopPropagation?.();
        event.preventDefault?.();
        setSearchFocused(false);
      }
      return;
    }
    if (event.targetEditable) return;
    if (isPlainKey(event, "/")) {
      event.stopPropagation?.();
      event.preventDefault?.();
      focusSearch();
    } else if (isPlainKey(event, "r")) {
      event.stopPropagation?.();
      event.preventDefault?.();
      refreshAll();
    } else if (isPlainKey(event, "o")) {
      event.stopPropagation?.();
      event.preventDefault?.();
      openSelected();
    }
  }, { allowEditable: true, enabled: focused });

  const handleRootKeyDown = useCallback((
    event: DataTableKeyEvent,
    context: DataTableRootKeyContext,
  ) => {
    if (context.selectedIndex <= 0 && isPlainArrowUp(event)) {
      stopSearchFocusNavigation(event);
      focusSearch();
      return true;
    }
    if (event.name === "/") {
      event.preventDefault?.();
      event.stopPropagation?.();
      focusSearch();
      return true;
    }
    if (event.name === "r") {
      event.preventDefault?.();
      event.stopPropagation?.();
      refreshAll();
      return true;
    }
    if (event.name === "o") {
      event.preventDefault?.();
      event.stopPropagation?.();
      openSelected();
      return true;
    }
    return false;
  }, [focusSearch, openSelected, refreshAll]);

  const updatedAgo = useUpdatedAgo(status === "loaded" ? lastUpdated : null);
  const footerInfo = useMemo<PaneFooterSegment[]>(() => [
    ...(oddsDelayed ? [{ id: "delayed", parts: [{ text: "odds delayed", tone: "warning" as const }] }] : []),
    ...(linkHint ? [{ id: "nolink", parts: [{ text: linkHint, tone: "muted" as const }] }] : []),
    ...(updatedAgo ? [{ id: "updated", parts: [{ text: `updated ${updatedAgo}`, tone: "muted" as const }] }] : []),
  ], [linkHint, oddsDelayed, updatedAgo]);

  usePaneStatusLinkFooter({
    registrationId: paneId ?? OPTIC_ODDS_PLUGIN_ID,
    focused,
    url: selected?.openUrl ?? null,
    source: "OpticOdds",
    label: "fixture",
    loading: status === "loading" && rows.length === 0,
    error,
    info: footerInfo,
    showOpenHint: !!selected?.openUrl,
    hints: [
      paneSearchHint(focusSearch),
      paneRefreshHint(refreshAll, { disabled: !apiKey }),
      { id: "open", key: "o", label: "pen", onPress: openSelected },
    ],
  });

  if (!apiKey) {
    return (
      <Box width={width} height={height} padding={1}>
        <EmptyState title="Add an OpticOdds key in BYOK" />
      </Box>
    );
  }

  const sportTabs = sports.map((sport) => ({ label: sport.name, value: sport.id }));
  const leagueTabs = [
    { label: "All", value: ALL_FILTER },
    ...visibleLeagues.map((league) => ({ label: league.name, value: league.id })),
  ];

  const filters = (
    <Box flexDirection="column">
      {sportTabs.length > 0 ? (
        <Box height={1}>
          <Tabs
            tabs={sportTabs}
            activeValue={sportId}
            onSelect={(value) => {
              setSportId(value);
              setLeagueId(ALL_FILTER);
              setSelectedIdx(0);
            }}
            compact
            variant="bare"
            focused={focused && !searchFocused}
          />
        </Box>
      ) : null}
      {sportTabs.length > 0 ? (
        <Box height={1}>
          <Tabs
            tabs={leagueTabs}
            activeValue={leagueId}
            onSelect={(value) => {
              setLeagueId(value);
              setSelectedIdx(0);
            }}
            compact
            variant="bare"
            focused={focused && !searchFocused}
          />
        </Box>
      ) : null}
      <InputSearchBar
        value={query}
        focused={focused}
        active={searchFocused}
        width={width}
        focusToken={searchFocusToken}
        inputRef={searchInputRef}
        placeholder="team"
        debounceMs={80}
        onFocus={focusSearch}
        onBlur={() => setSearchFocused(false)}
        onNavigateDown={() => setSearchFocused(false)}
        onQueryChange={updateQuery}
      />
    </Box>
  );

  if (status === "loading" && rows.length === 0) {
    return (
      <Box flexDirection="column" width={width} height={height}>
        {filters}
        <Box flexGrow={1} justifyContent="center" alignItems="center">
          <Spinner label="Loading OpticOdds..." />
        </Box>
      </Box>
    );
  }

  if (error && rows.length === 0) {
    return (
      <Box flexDirection="column" width={width} height={height} padding={1}>
        {filters}
        <EmptyState title="OpticOdds unavailable." message={error} hint="Press r to retry." />
      </Box>
    );
  }

  return (
    <DataTableView<FixtureRow, OddsColumn>
      focused={focused && !searchFocused}
      rootWidth={width}
      rootHeight={height}
      rootBefore={filters}
      selection={{
        kind: "id",
        selectedId: selected?.id ?? null,
        getId: (row) => row.id,
        onChange: (id) => {
          const index = filtered.findIndex((row) => row.id === id);
          setSelectedIdx(index < 0 ? 0 : index);
        },
      }}
      onActivate={(row) => {
        if (row.openUrl) {
          setLinkHint(null);
          openUrl(row.openUrl);
          return;
        }
        setLinkHint("No sportsbook link");
      }}
      columns={COLUMNS}
      items={filtered}
      getItemKey={(row) => row.id}
      renderCell={(row, column, _index, state) => renderCell(row, column, state.selected)}
      emptyStateTitle={query.trim() ? "No fixtures match that team." : "No active fixtures."}
      onRootKeyDown={handleRootKeyDown}
    />
  );
}
