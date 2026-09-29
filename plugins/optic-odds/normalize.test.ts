import { describe, expect, test } from "bun:test";
import { normalizeFixtureRow } from "./normalize";

const ASTROS_ROYALS_ODDS = {
  id: "20240429HOUKS",
  start_date: "2024-04-29T23:40:00.000Z",
  home_competitors: [{ id: "houston_astros", name: "Houston Astros" }],
  away_competitors: [{ id: "kansas_city_royals", name: "Kansas City Royals" }],
  home_team_display: "Houston Astros",
  away_team_display: "Kansas City Royals",
  league: { id: "mlb", name: "MLB" },
  sport: { id: "baseball", name: "Baseball" },
  odds: [
    {
      sportsbook: "DraftKings",
      market: "Moneyline",
      name: "Houston Astros",
      is_main: true,
      price: -185,
      deep_link: { desktop: "https://sportsbook.draftkings.com/event/astros-royals" },
    },
    {
      sportsbook: "DraftKings",
      market: "Moneyline",
      name: "Kansas City Royals",
      is_main: true,
      price: 155,
    },
    {
      sportsbook: "FanDuel",
      market: "Moneyline",
      name: "Houston Astros",
      is_main: true,
      price: -180,
    },
    {
      sportsbook: "DraftKings",
      market: "Point Spread",
      name: "Houston Astros",
      is_main: true,
      points: -1.5,
      price: -110,
    },
    {
      sportsbook: "DraftKings",
      market: "Total Points",
      name: "Over",
      is_main: true,
      points: 8.5,
      price: -105,
    },
    {
      sportsbook: "DraftKings",
      market: "Total Points",
      name: "Under",
      is_main: true,
      points: 8.5,
      price: -115,
    },
  ],
};

describe("normalizeFixtureRow", () => {
  test("maps Optic Astros/Royals odds onto one table row", () => {
    const row = normalizeFixtureRow(ASTROS_ROYALS_ODDS);
    expect(row).toEqual({
      id: "20240429HOUKS",
      start: "2024-04-29T23:40:00.000Z",
      league: "MLB",
      away: "Kansas City Royals",
      home: "Houston Astros",
      mlHome: "-185",
      mlAway: "+155",
      spread: "-1.5 (-110)",
      total: "o 8.5 (-105)",
      bookCount: 2,
      openUrl: "https://sportsbook.draftkings.com/event/astros-royals",
    });
  });

  test("leaves odds blank and bookCount 0 when a fixture has no odds", () => {
    const row = normalizeFixtureRow({
      id: "20240430NYNYA",
      start_date: "2024-04-30T23:05:00.000Z",
      home_competitors: [{ id: "new_york_yankees", name: "New York Yankees" }],
      away_competitors: [{ id: "boston_red_sox", name: "Boston Red Sox" }],
      league: { id: "mlb", name: "MLB" },
      sport: { id: "baseball", name: "Baseball" },
    });
    expect(row).toEqual({
      id: "20240430NYNYA",
      start: "2024-04-30T23:05:00.000Z",
      league: "MLB",
      away: "Boston Red Sox",
      home: "New York Yankees",
      mlHome: "",
      mlAway: "",
      spread: "",
      total: "",
      bookCount: 0,
      openUrl: null,
    });
  });
});
