export const OPTIC_ODDS_PLUGIN_ID = "optic-odds";
export const OPTIC_ODDS_PANE_ID = "optic-odds";
export const OPTIC_ODDS_CONNECTION_ID = "optic-odds";
export const OPTIC_ODDS_API_BASE = "https://api.opticodds.com/api/v3";
export const OPTIC_ODDS_ODDS_CHUNK = 5;
export const OPTIC_ODDS_PREFERRED_BOOKS = [
  "DraftKings",
  "FanDuel",
  "BetMGM",
  "Caesars",
  "Pinnacle",
] as const;

export interface OpticNamedEntity {
  id: string;
  name: string;
  sportId?: string;
}

export interface FixtureRow {
  id: string;
  start: string;
  league: string;
  away: string;
  home: string;
  mlHome: string;
  mlAway: string;
  spread: string;
  total: string;
  bookCount: number;
  openUrl: string | null;
}
