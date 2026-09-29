import type { FixtureRow, OpticNamedEntity } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function namedName(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  return asString(value.name);
}

function nestedSportId(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const sport = value.sport;
  if (typeof sport === "string") return asString(sport);
  if (!isRecord(sport)) return asString(value.sport_id);
  return asString(sport.id) ?? asString(value.sport_id);
}

function firstCompetitorName(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  for (const item of value) {
    const name = namedName(item);
    if (name) return name;
  }
  return undefined;
}

export function parseDataArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (isRecord(payload) && Array.isArray(payload.data)) return payload.data;
  return [];
}

export function parseNamedEntities(payload: unknown): OpticNamedEntity[] {
  const entities: OpticNamedEntity[] = [];
  for (const item of parseDataArray(payload)) {
    if (!isRecord(item)) continue;
    const id = asString(item.id);
    if (!id) continue;
    const sportId = nestedSportId(item);
    entities.push(sportId ? { id, name: asString(item.name) ?? id, sportId } : { id, name: asString(item.name) ?? id });
  }
  return entities;
}

function sameTeam(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function marketKind(market: string): "ml" | "spread" | "total" | null {
  const key = market.toLowerCase().replace(/[\s_-]+/g, "");
  if (key === "moneyline" || key === "ml" || key === "h2h") return "ml";
  if (key === "spread" || key === "pointspread" || key === "handicap") return "spread";
  if (key === "total" || key === "totalpoints" || key === "totals") return "total";
  return null;
}

function formatAmerican(price: number): string {
  if (price > 0) return `+${price}`;
  return String(price);
}

function sportsbookKey(odd: Record<string, unknown>): string | undefined {
  const value = odd.sportsbook;
  if (typeof value === "string") return asString(value);
  if (!isRecord(value)) return undefined;
  return asString(value.id) ?? asString(value.name);
}

function oddName(odd: Record<string, unknown>): string | undefined {
  return asString(odd.name) ?? asString(odd.selection) ?? asString(odd.normalized_selection);
}

function isMainOdd(odd: Record<string, unknown>): boolean {
  return odd.is_main !== false;
}

function isHomeSelection(odd: Record<string, unknown>, home: string): boolean {
  const line = asString(odd.selection_line)?.toLowerCase();
  if (line === "home") return true;
  const name = oddName(odd);
  return !!name && sameTeam(name, home);
}

function isOverSelection(odd: Record<string, unknown>): boolean {
  const name = oddName(odd)?.toLowerCase();
  if (!name) return false;
  return name === "over" || name.startsWith("over ") || name === "o";
}

function desktopLink(odd: Record<string, unknown>): string | null {
  const link = odd.deep_link;
  if (!isRecord(link)) return null;
  return asString(link.desktop) ?? null;
}

export function normalizeFixtureRows(payload: unknown): FixtureRow[] {
  const rows: FixtureRow[] = [];
  for (const item of parseDataArray(payload)) {
    const row = normalizeFixtureRow(item);
    if (row) rows.push(row);
  }
  return rows;
}

export function normalizeFixtureRow(raw: unknown): FixtureRow | null {
  if (!isRecord(raw)) return null;
  const id = asString(raw.id);
  if (!id) return null;
  const start = asString(raw.start_date) ?? asString(raw.start);
  if (!start) return null;
  const home = asString(raw.home_team_display) ?? firstCompetitorName(raw.home_competitors) ?? namedName(raw.home_team);
  const away = asString(raw.away_team_display) ?? firstCompetitorName(raw.away_competitors) ?? namedName(raw.away_team);
  if (!home || !away) return null;
  const league = namedName(raw.league) ?? asString(raw.league) ?? "";

  let mlHome = "";
  let mlAway = "";
  let spread = "";
  let total = "";
  let openUrl: string | null = null;
  const books = new Set<string>();

  const odds = Array.isArray(raw.odds) ? raw.odds : [];
  for (const item of odds) {
    if (!isRecord(item) || !isMainOdd(item)) continue;
    const market = asString(item.market);
    if (!market) continue;
    const kind = marketKind(market);
    if (!kind) continue;
    const book = sportsbookKey(item);
    if (book) books.add(book);
    if (!openUrl) openUrl = desktopLink(item);
    const price = asFiniteNumber(item.price);
    const points = asFiniteNumber(item.points);

    if (kind === "ml" && price != null) {
      if (!mlHome && isHomeSelection(item, home)) mlHome = formatAmerican(price);
      else if (!mlAway && !isHomeSelection(item, home)) mlAway = formatAmerican(price);
    } else if (kind === "spread" && price != null && points != null && !spread && isHomeSelection(item, home)) {
      spread = `${String(points)} (${formatAmerican(price)})`;
    } else if (kind === "total" && price != null && points != null && !total && isOverSelection(item)) {
      total = `o ${String(points)} (${formatAmerican(price)})`;
    }
  }

  return {
    id,
    start,
    league,
    away,
    home,
    mlHome,
    mlAway,
    spread,
    total,
    bookCount: books.size,
    openUrl,
  };
}
