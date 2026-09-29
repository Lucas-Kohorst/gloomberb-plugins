# Hyperliquid

Public, keyless market data for Hyperliquid perpetuals and spot pairs. Open **HL** in the command bar, or **HL HYPE** to filter immediately. Click any column header to sort; press **s** to search, select a market to inspect it, and **o** to open its exchange page.

- Searchable perp/spot table: price, 24-hour change, quote-currency volume, hourly funding rate, and base-unit open interest.
- Candlestick charts (1D/1W/1M), live order-book depth, and a bounded, deduplicated trade feed.
- Watchlists and quote monitors: `HL:BTC`, `HL:ETH`, `HL:HYPE` for perpetuals. Spot uses the exchange pair ID, such as `HL:@107` for HYPE/USDC. The detail header shows the exact symbol. Token IDs and spot pair IDs are different; search resolves the display name.
- Pane settings accept an optional **public wallet address** for read-only perpetual positions, unrealized PnL, margin, and spot balances. No private key, signing, order submission, or funds transfer is implemented.
- Connections lists both REST and WebSocket traffic. Metadata refreshes every 30 seconds; streams reconnect automatically and close when their consumer unmounts.

Install/update the monorepo:

```sh
gloomberb install Lucas-Kohorst/gloomberb-plugins
# Existing installation:
gloomberb update gloomberb-plugins
```

In Marketplace this is a **Local** plugin until the external registry lists it. Merging this repository does not publish to `plugins.gloom.sh`. Native terminal and desktop targets are supported; hosted web does not load this local installation.

CLI:

```sh
gloomberb hyperliquid
gloomberb hyperliquid HYPE
gloomberb hyperliquid '@107' --book
```

Requires Gloomberb 0.13.15 or newer. Uses the host's renderer-neutral tables, chart surface, settings, connections, and capability APIs. Kitty chart support is preserved.

## Verification

With Gloomberb linked as the optional peer dependency:

```sh
bun test plugins/hyperliquid
bun run --cwd plugins/hyperliquid typecheck
```

Protocol references: [Info](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint), [Perpetuals](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/perpetuals), [Spot](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/spot), [WebSocket](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket/subscriptions).
