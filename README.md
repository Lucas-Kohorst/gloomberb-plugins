# gloomberb-plugins

External plugins for [Gloomberb](https://github.com/Lucas-Kohorst/gloomberb). Each folder under `plugins/` is a standalone plugin package that Gloomberb loads from `~/.gloomberb/plugins/`.

## Installing

```sh
# Clone the whole monorepo (the loader discovers every plugin subfolder):
gloomberb install Lucas-Kohorst/gloomberb-plugins

# Or clone manually and let the host link itself:
git clone https://github.com/Lucas-Kohorst/gloomberb-plugins.git ~/.gloomberb/plugins/gloomberb-plugins
cd ~/.gloomberb/plugins/gloomberb-plugins && bun install
```

Gloomberb links `gloomberb` and `react` from the running install into each plugin's `node_modules`, so plugins never bundle their own copy.

## Plugin list

| Plugin | Description | Targets |
|--------|-------------|---------|
| defillama | DefiLlama TVL, fees, and revenue chart series | cli, tui, desktop |
| opensky | OpenSky aircraft positions | cli, tui, desktop |
| nasa-firms | NASA FIRMS fire hotspots | cli, tui, desktop |
| usgs-earthquakes | USGS earthquake feed | cli, tui, desktop |
| space-weather | NOAA space weather data | cli, tui, desktop |
| federal-register | US Federal Register documents | cli, tui, desktop |
| ofac-sanctions | OFAC sanctions list search | cli, tui, desktop |
| crt-sh | crt.sh certificate transparency search | cli, tui, desktop |
| usaspending | USAspending.gov data | cli, tui, desktop |
| traffic | OpenSky aircraft and Digitraffic AIS ship positions | cli, tui, desktop |
| satellite | NASA GIBS satellite imagery | cli, tui, desktop |
| congress-trades | Congressional trading disclosures | cli, tui, desktop |
| polls | VoteHub prediction market polls | cli, tui, desktop |
| country-econ | World Bank country economic indicators | cli, tui, desktop |
| weather | Weather Company, NWS, Kalshi settlement weather | cli, tui, desktop |
| prediction-markets | Kalshi and Polymarket prediction markets | cli, tui, desktop |
| broker-public | Public.com broker adapter | cli, tui, desktop |
| broker-robinhood | Robinhood broker adapter | cli, tui, desktop |
| broker-simplefin | SimpleFin broker adapter | cli, tui, desktop |

## Developing a plugin

```sh
mkdir plugins/my-plugin
cd plugins/my-plugin
# Create package.json, index.ts — see any existing plugin for the pattern.
```

Each plugin declares `gloomberb` and `react` as optional peer dependencies. The public API surface is:

- `gloomberb/types/plugin` — `GloomPlugin`, `PaneProps`, registration types
- `gloomberb/plugins` — `createChartSource`, `createFeedSource`, `createConnection`, `withConnectionRequest`, `createAlert`
- `gloomberb/ui` — `Box`, `Text`, `ScrollBox`, `TextAttributes`
- `gloomberb/components` — `DataTableStackView`, `EmptyState`, `Spinner`, `Tabs`, `InputSearchBar`, `useExternalLinkFooter`
- `gloomberb/react` — `usePluginPaneState`, `useShortcut`, `useAutoRefresh`, `usePaneStatusLinkFooter`, pane footer helpers
- `gloomberb/theme` — `colors`
- `gloomberb/utils` — `httpFetch`, `createThrottledFetch`, `formatCompact`, `formatRelativeAge`, `isPlainKey`, sort helpers
- `gloomberb/capabilities` — `chartSeriesProvider`, `newsProvider`, `ResolvedSeries`
