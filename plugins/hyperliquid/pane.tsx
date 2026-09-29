import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, ScrollBox, type InputRenderable } from "gloomberb/ui";
import {
  DataTableStackView,
  DataTableView,
  InputSearchBar,
  EmptyState,
  Spinner,
  Tabs,
  StaticChartSurface,
  useExternalLinkFooter,
  type DataTableColumn,
} from "gloomberb/components";
import {
  usePluginPaneState,
  usePaneSettingValue,
  useShortcut,
} from "gloomberb/react";
import { colors } from "gloomberb/theme";
import { isPlainKey, formatCompact } from "gloomberb/utils";
import type { PaneProps } from "gloomberb/types/plugin";
import type { PricePoint } from "gloomberb/types/financials";
import { client } from "./client";
import { provider } from "./provider";
import { changePercent, mergeTrades, number } from "./normalize";
import { subscribe } from "./ws";
import type {
  Book,
  Market,
  StreamStatus,
  Trade,
  WalletState,
  SpotState,
} from "./types";

const COLUMNS: DataTableColumn[] = [
  { id: "name", label: "MARKET", width: 22, flexGrow: 1, align: "left" },
  { id: "kind", label: "TYPE", width: 6, align: "left" },
  { id: "price", label: "PRICE", width: 14, align: "right" },
  { id: "change", label: "24H %", width: 9, align: "right" },
  { id: "volume", label: "24H VOL", width: 12, align: "right" },
  { id: "funding", label: "FUNDING %", width: 12, align: "right" },
  { id: "openInterest", label: "OI (BASE)", width: 12, align: "right" },
];
const TABS = [
  { value: "chart", label: "Chart" },
  { value: "book", label: "Order book" },
  { value: "trades", label: "Trades" },
  { value: "wallet", label: "Wallet" },
];
const FILTERS = [
  { value: "all", label: "All" },
  { value: "perp", label: "Perpetuals" },
  { value: "spot", label: "Spot" },
];
function fmt(n: number | null | undefined) {
  return n == null
    ? "—"
    : n.toLocaleString("en-US", { maximumFractionDigits: 8 });
}
function pct(n: number | null) {
  return n == null ? "—" : `${n.toFixed(4)}%`;
}
function value(m: Market, id: string): string | number | null {
  if (id === "change") return changePercent(m);
  return m[id as keyof Market];
}
function compare(a: Market, b: Market, id: string, direction: string) {
  const av = value(a, id),
    bv = value(b, id);
  if (av == null) return bv == null ? 0 : 1;
  if (bv == null) return -1;
  return (
    (typeof av === "string" && typeof bv === "string"
      ? av.localeCompare(bv)
      : Number(av) - Number(bv)) * (direction === "asc" ? 1 : -1)
  );
}
function BookView({ book, width }: { book: Book | null; width: number }) {
  if (!book) return <Spinner label="Loading order book…" />;
  const max = Math.max(1, ...book.levels.flat().map((l) => number(l.sz) ?? 0));
  const half = Math.max(20, Math.floor(width / 2));
  return (
    <Box flexDirection="row" width={width}>
      {book.levels.map((levels, side) => (
        <Box key={side} flexDirection="column" width={half}>
          <Text fg={side ? colors.negative : colors.positive}>
            {side ? "ASK · price / size" : "BID · price / size"}
          </Text>
          {levels.slice(0, 20).map((l, i) => (
            <Box key={i} width={half} height={1}>
              <Box
                position="absolute"
                left={0}
                top={0}
                height={1}
                width={Math.max(
                  1,
                  Math.round(((number(l.sz) ?? 0) / max) * half),
                )}
                backgroundColor={
                  side ? colors.negative + "33" : colors.positive + "33"
                }
              />
              <Text fg={colors.text}>
                {fmt(number(l.px))} / {fmt(number(l.sz))}
              </Text>
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
}
function TradesView({
  trades,
  focused,
}: {
  trades: Trade[];
  focused: boolean;
}) {
  const [sort, setSort] = useState("time"),
    [direction, setDirection] = useState<"asc" | "desc">("desc");
  const rows = useMemo(
    () =>
      [...trades].sort((a, b) => {
        const av = a[sort as keyof Trade],
          bv = b[sort as keyof Trade];
        return (
          (sort === "side"
            ? String(av).localeCompare(String(bv))
            : Number(av) - Number(bv)) * (direction === "asc" ? 1 : -1)
        );
      }),
    [trades, sort, direction],
  );
  return (
    <DataTableView
      emptyStateTitle="Waiting for trades…"
      items={rows}
      columns={[
        { id: "time", label: "TIME", width: 14, align: "left" },
        { id: "side", label: "SIDE", width: 8, align: "left" },
        { id: "px", label: "PRICE", width: 18, align: "right" },
        { id: "sz", label: "SIZE", width: 18, align: "right" },
      ]}
      focused={focused}
      selection={{ kind: "none" }}
      getItemKey={(t) => `${t.time}:${t.tid}`}
      sortColumnId={sort}
      sortDirection={direction}
      onHeaderClick={(id) => {
        if (id === sort) setDirection((d) => (d === "asc" ? "desc" : "asc"));
        else {
          setSort(id);
          setDirection("desc");
        }
      }}
      renderCell={(t, c) => ({
        text:
          c.id === "time"
            ? new Date(t.time).toLocaleTimeString()
            : c.id === "side"
              ? t.side === "B"
                ? "Buy"
                : "Sell"
              : fmt(number(t[c.id as "px" | "sz"])),
        color: t.side === "B" ? colors.positive : colors.negative,
      })}
    />
  );
}
function Detail({
  market,
  width,
  height,
  focused,
  wallet,
  refreshKey,
}: {
  market: Market;
  width: number;
  height: number;
  focused: boolean;
  wallet: string;
  refreshKey: number;
}) {
  const [tab, setTab] = usePluginPaneState("detailTab", "chart");
  const [range, setRange] = useState<"1D" | "1W" | "1M">("1D");
  const [points, setPoints] = useState<PricePoint[]>([]),
    [book, setBook] = useState<Book | null>(null),
    [trades, setTrades] = useState<Trade[]>([]);
  const [account, setAccount] = useState<[WalletState, SpotState] | null>(null);
  const [error, setError] = useState<string | null>(null),
    [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StreamStatus>("connecting");
  useEffect(() => {
    let active = true;
    setPoints([]);
    setBook(null);
    setTrades([]);
    setAccount(null);
    setError(null);
    setLoading(true);
    const load = async () => {
      try {
        if (tab === "chart") {
          const data = await provider.getPriceHistory(
            `HL:${market.coin}`,
            "Hyperliquid",
            range,
          );
          if (active) setPoints(data);
        }
        if (tab === "book") {
          const data = await client.book(market.coin);
          if (active)
            setBook((current) =>
              current && current.time > data.time ? current : data,
            );
        }
        if (tab === "wallet" && wallet) {
          const data = await client.wallet(wallet);
          if (active) setAccount(data);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [market.coin, range, tab, wallet, refreshKey]);
  useEffect(() => {
    if (tab !== "book" && tab !== "trades") return;
    return subscribe(market.coin, {
      book: setBook,
      trades: (next) => setTrades((prev) => mergeTrades(prev, next)),
      status: setStatus,
    });
  }, [market.coin, tab]);
  const chartPoints = useMemo(
    () =>
      points.map((p) => ({
        ...p,
        open: p.open ?? p.close,
        high: p.high ?? p.close,
        low: p.low ?? p.close,
        volume: p.volume ?? 0,
      })),
    [points],
  );
  const palette = useMemo(
    () => ({
      lineColor: colors.positive,
      candleDown: colors.negative,
      gridColor: colors.border,
      crosshairColor: colors.text,
      bgColor: colors.bg,
      axisColor: colors.textDim,
    }),
    [],
  );
  return (
    <Box flexDirection="column" width={width} height={height} paddingX={1}>
      <Text fg={colors.textDim}>
        {market.kind} · {fmt(market.price)} {market.currency} · 24h{" "}
        {pct(changePercent(market))}
        {market.kind === "perp"
          ? ` · Funding ${pct(market.funding == null ? null : market.funding * 100)} · OI ${fmt(market.openInterest)} · ${market.leverage}x`
          : ""}
      </Text>
      <Tabs tabs={TABS} activeValue={tab} onSelect={setTab} focused={focused} />
      {error ? (
        <EmptyState title="Could not load market data" message={error} />
      ) : loading ? (
        <Spinner label="Loading…" />
      ) : tab === "chart" ? (
        <Box flexDirection="column">
          <Tabs
            tabs={[
              { value: "1D", label: "1D" },
              { value: "1W", label: "1W" },
              { value: "1M", label: "1M" },
            ]}
            activeValue={range}
            onSelect={(v) => setRange(v as typeof range)}
          />
          {points.length ? (
            <StaticChartSurface
              points={chartPoints}
              mode="candles"
              width={Math.max(1, width - 2)}
              height={Math.max(5, height - 5)}
              colors={palette}
              showTimeAxis
            />
          ) : (
            <EmptyState title="No candles available" />
          )}
        </Box>
      ) : tab === "book" ? (
        <ScrollBox height={Math.max(3, height - 3)}>
          <Text fg={colors.textDim}>{status}</Text>
          <BookView book={book} width={Math.max(1, width - 2)} />
        </ScrollBox>
      ) : tab === "trades" ? (
        <Box flexDirection="column" flexGrow={1}>
          <Text fg={colors.textDim}>{status}</Text>
          {trades.length ? (
            <TradesView trades={trades} focused={focused} />
          ) : (
            <EmptyState title="Waiting for trades…" />
          )}
        </Box>
      ) : !wallet ? (
        <EmptyState
          title="No wallet selected"
          message="Add a public wallet address in pane settings to view positions and balances."
        />
      ) : account ? (
        <ScrollBox height={Math.max(3, height - 3)}>
          <Box flexDirection="column">
            <Text fg={colors.text}>
              Account value:{" "}
              {fmt(number(account[0].marginSummary.accountValue))} USD · Margin
              used: {fmt(number(account[0].marginSummary.totalMarginUsed))} USD
            </Text>
            {account[0].assetPositions.length ? (
              account[0].assetPositions.map(({ position: p }) => (
                <Text key={p.coin} fg={colors.text}>
                  {p.coin} · Size {p.szi} · Entry {p.entryPx ?? "—"} ·
                  Unrealized PnL {p.unrealizedPnl} USD · Liquidation{" "}
                  {p.liquidationPx ?? "—"}
                </Text>
              ))
            ) : (
              <Text fg={colors.textDim}>No perpetual positions.</Text>
            )}
            {account[1].balances.map((b) => (
              <Text key={b.coin} fg={colors.text}>
                {b.coin} · Balance {b.total} · Held {b.hold}
              </Text>
            ))}
          </Box>
        </ScrollBox>
      ) : null}
    </Box>
  );
}
export function HyperliquidPane({ focused, width, height }: PaneProps) {
  const [initialQuery] = usePaneSettingValue("query", "");
  const [walletValue] = usePaneSettingValue("wallet", "");
  const wallet = String(walletValue ?? "").trim();
  const [query, setQuery] = usePluginPaneState("query", String(initialQuery));
  const [kind, setKind] = usePluginPaneState("kind", "all");
  const [selected, setSelected] = usePluginPaneState<string | null>(
    "selected",
    null,
  );
  const [detail, setDetail] = usePluginPaneState<string | null>("detail", null);
  const [sort, setSort] = usePluginPaneState("sort", "volume");
  const [direction, setDirection] = usePluginPaneState<"asc" | "desc">(
    "direction",
    "desc",
  );
  const [markets, setMarkets] = useState<Market[]>([]),
    [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true),
    [status, setStatus] = useState<StreamStatus>("connecting");
  const [refreshKey, setRefreshKey] = useState(0);
  const [searching, setSearching] = useState(false),
    [focusToken, setFocusToken] = useState(0);
  const inputRef = useRef<InputRenderable | null>(null);
  const mids = useRef<Record<string, string>>({});
  const focusSearch = useCallback(() => {
    setSearching(true);
    setFocusToken((n) => n + 1);
  }, []);
  useEffect(() => {
    let active = true,
      busy = false;
    async function load() {
      if (busy) return;
      busy = true;
      try {
        const data = await client.getMarkets(true);
        if (active) {
          setMarkets(
            data.map((m) => ({
              ...m,
              price: number(mids.current[m.coin]) ?? m.price,
            })),
          );
          setError(null);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : String(e));
      } finally {
        busy = false;
        if (active) setLoading(false);
      }
    }
    void load();
    const timer = setInterval(load, 30_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [refreshKey]);
  useEffect(() => {
    let pending: Record<string, string> | null = null;
    const stop = subscribe(null, {
      mids: (next) => {
        mids.current = next;
        pending = next;
      },
      status: setStatus,
    });
    const timer = setInterval(() => {
      if (!pending) return;
      const next = pending;
      pending = null;
      setMarkets((prev) =>
        prev.map((m) => ({ ...m, price: number(next[m.coin]) ?? m.price })),
      );
    }, 500);
    return () => {
      stop();
      clearInterval(timer);
    };
  }, []);
  const rows = useMemo(() => {
    const q = query.trim().replace(/^HL:/i, "").toLowerCase();
    return markets
      .filter(
        (m) =>
          (kind === "all" || m.kind === kind) &&
          (!q ||
            m.name.toLowerCase().includes(q) ||
            m.coin.toLowerCase().includes(q)),
      )
      .sort((a, b) => compare(a, b, sort, direction));
  }, [markets, kind, query, sort, direction]);
  const current =
    markets.find((m) => m.coin === detail) ??
    rows.find((m) => m.coin === selected) ??
    rows[0];
  useShortcut((event) => {
    if (!focused || searching) return;
    if (!detail && isPlainKey(event, "s")) {
      event.preventDefault?.();
      focusSearch();
    }
    if (isPlainKey(event, "r")) setRefreshKey((n) => n + 1);
  });
  useExternalLinkFooter({
    registrationId: "hyperliquid",
    focused: focused && !searching,
    url: current
      ? `https://app.hyperliquid.xyz/trade/${encodeURIComponent(current.coin)}`
      : null,
    trailingInfo: [
      {
        id: "status",
        parts: [
          {
            text: error
              ? (markets.length ? "stale · " : "") + error
              : loading
                ? "loading"
                : status,
            tone: error ? "warning" : "muted",
          },
        ],
      },
    ],
    hints: detail
      ? []
      : [{ id: "search", key: "s", label: "earch", onPress: focusSearch }],
  });
  if (loading && !markets.length)
    return <Spinner label="Loading Hyperliquid markets…" />;
  if (error && !markets.length)
    return <EmptyState title="Hyperliquid unavailable" message={error} />;
  return (
    <DataTableStackView
      emptyStateTitle="No markets match this search"
      items={rows}
      columns={COLUMNS}
      focused={focused && !searching}
      rootWidth={width}
      rootHeight={height}
      getItemKey={(m) => m.coin}
      sortColumnId={sort}
      sortDirection={direction}
      onHeaderClick={(id) => {
        if (id === sort) setDirection((d) => (d === "asc" ? "desc" : "asc"));
        else {
          setSort(id);
          setDirection("desc");
        }
      }}
      selection={{
        kind: "id",
        selectedId: selected,
        getId: (m) => m.coin,
        onChange: (id) => setSelected(id),
      }}
      onActivate={(m) => {
        setSearching(false);
        setDetail(m.coin);
      }}
      detailOpen={!!detail && !!current}
      onBack={() => setDetail(null)}
      detailTitle={current ? `${current.name} · HL:${current.coin}` : undefined}
      detailContent={
        detail && current ? (
          <Detail
            key={current.coin}
            market={current}
            width={width}
            height={height - 1}
            focused={focused}
            wallet={wallet}
            refreshKey={refreshKey}
          />
        ) : null
      }
      rootBefore={
        <Box flexDirection="column">
          <Tabs tabs={FILTERS} activeValue={kind} onSelect={setKind} />
          <InputSearchBar
            value={query}
            focused={focused}
            active={searching}
            width={width}
            focusToken={focusToken}
            inputRef={inputRef}
            placeholder="Search coin or spot pair"
            debounceMs={150}
            onQueryChange={setQuery}
            onFocus={focusSearch}
            onBlur={() => setSearching(false)}
            onNavigateDown={() => setSearching(false)}
          />
        </Box>
      }
      renderCell={(m, c, _i, state) => {
        const raw = value(m, c.id);
        const text =
          c.id === "funding"
            ? pct(m.funding == null ? null : m.funding * 100)
            : c.id === "change"
              ? pct(changePercent(m))
              : c.id === "volume" || c.id === "openInterest"
                ? raw == null
                  ? "—"
                  : formatCompact(Number(raw))
                : typeof raw === "number"
                  ? fmt(raw)
                  : (raw ?? "—");
        return {
          text,
          color: state.selected
            ? colors.selectedText
            : c.id === "change" && typeof raw === "number"
              ? raw < 0
                ? colors.negative
                : colors.positive
              : colors.text,
        };
      }}
    />
  );
}
