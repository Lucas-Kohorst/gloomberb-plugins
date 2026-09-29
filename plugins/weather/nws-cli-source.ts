/**
 * NWS Daily Climate Report (CLI) source, types, and fetch, inlined from the
 * first-party `src/sources/nws-cli` module so this external plugin is
 * self-contained. The host-facing `./nws-cli` wrapper re-exports the pieces
 * the rest of the plugin and the command surface need.
 *
 * The CLI product is the "first-final" daily climate report Kalshi high/low
 * weather markets settle against.
 */

export const NWS_CLI_PROVIDER_ID = "nws-cli";
export const NWS_CLI_USER_AGENT =
  "Gloomberb (https://terminal.kohor.st; nws-cli@kohor.st)";

export type NwsCliPrintKind = "final" | "preliminary";

/** First-final NWS Daily Climate Report (CLI) keyed by ICAO station. */
export interface NwsCliPrint {
  provider: typeof NWS_CLI_PROVIDER_ID;
  seriesId: string;
  icao: string;
  cliProduct: string;
  date: string;
  issuedAt: string | null;
  printKind: NwsCliPrintKind;
  highF: number | null;
  lowF: number | null;
  precipIn: number | null;
  productId: string | null;
  sourceUrl: string | null;
}

export interface NwsCliPrintSet {
  provider: typeof NWS_CLI_PROVIDER_ID;
  seriesId: string;
  icao: string;
  prints: NwsCliPrint[];
}

const MONTHS: Readonly<Record<string, string>> = {
  JANUARY: "01",
  FEBRUARY: "02",
  MARCH: "03",
  APRIL: "04",
  MAY: "05",
  JUNE: "06",
  JULY: "07",
  AUGUST: "08",
  SEPTEMBER: "09",
  OCTOBER: "10",
  NOVEMBER: "11",
  DECEMBER: "12",
};

const SUMMARY_DATE_RE =
  /CLIMATE SUMMARY FOR ([A-Z]+) (\d{1,2}) (\d{4})/i;
const CLI_HEADER_RE = /^CLI([A-Z0-9]{2,5})\s*$/m;
const MAX_TEMP_RE = /^\s*MAXIMUM\s+(-?\d+(?:\.\d+)?|M)\b/im;
const MIN_TEMP_RE = /^\s*MINIMUM\s+(-?\d+(?:\.\d+)?|M)\b/im;
const PRECIP_RE = /^\s*PRECIPITATION \(IN\)[\s\S]{0,240}?^\s*(?:YESTERDAY|TODAY)?\s*(-?\d+(?:\.\d+)?|T|M)\b/im;

export function normalizeIcaoStation(token: string): string | null {
  const compact = token.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!compact) return null;
  if (/^[A-Z]{4}$/.test(compact)) return compact;
  if (/^[A-Z]{3}$/.test(compact)) return `K${compact}`;
  if (compact.startsWith("CLI") && compact.length >= 5 && compact.length <= 8) {
    const rest = compact.slice(3);
    return rest.length === 3 ? `K${rest}` : rest.length === 4 ? rest : null;
  }
  return null;
}

export function cliProductCodeForIcao(icao: string): string {
  const id = icao.trim().toUpperCase();
  if (id.startsWith("K") && id.length === 4) return `CLI${id.slice(1)}`;
  return `CLI${id}`;
}

export function parseClimateSummaryDate(text: string): string | null {
  const match = SUMMARY_DATE_RE.exec(text);
  if (!match) return null;
  const month = MONTHS[match[1]!.toUpperCase()];
  const day = match[2]!.padStart(2, "0");
  const year = match[3]!;
  if (!month) return null;
  return `${year}-${month}-${day}`;
}

function parseMaybeNumber(token: string | undefined): number | null {
  if (!token || token === "M") return null;
  if (token === "T") return 0;
  const value = Number(token);
  return Number.isFinite(value) ? value : null;
}

export function detectCliPrintKind(text: string): NwsCliPrintKind {
  if (/PRELIMINARY LOCAL CLIMATE DATA/i.test(text)) return "preliminary";
  return "final";
}

export function parseNwsCliProductText(
  text: string,
  options: {
    icao: string;
    issuedAt?: string | null;
    productId?: string | null;
    sourceUrl?: string | null;
  },
): NwsCliPrint | null {
  const icao = normalizeIcaoStation(options.icao);
  if (!icao) return null;
  const header = CLI_HEADER_RE.exec(text);
  const cliProduct = header ? `CLI${header[1]}` : cliProductCodeForIcao(icao);
  const date = parseClimateSummaryDate(text);
  if (!date) return null;
  const maxSection = text.match(/TEMPERATURE \(F\)[\s\S]{0,800}?MINIMUM[\s\S]{0,120}/i)?.[0] ?? text;
  return {
    provider: NWS_CLI_PROVIDER_ID,
    seriesId: icao,
    icao,
    cliProduct,
    date,
    issuedAt: options.issuedAt ?? null,
    printKind: detectCliPrintKind(text),
    highF: parseMaybeNumber(MAX_TEMP_RE.exec(maxSection)?.[1]),
    lowF: parseMaybeNumber(MIN_TEMP_RE.exec(maxSection)?.[1]),
    precipIn: parseMaybeNumber(PRECIP_RE.exec(text)?.[1]),
    productId: options.productId ?? null,
    sourceUrl: options.sourceUrl ?? null,
  };
}

/** Earliest non-preliminary CLI print for a climate date. */
export function firstFinalCliPrint(
  prints: readonly NwsCliPrint[],
  date?: string,
): NwsCliPrint | null {
  const matching = prints.filter((print) => {
    if (print.printKind !== "final") return false;
    if (date && print.date !== date) return false;
    return true;
  });
  if (matching.length === 0) return null;
  return [...matching].sort((left, right) => {
    const leftTs = left.issuedAt ?? "";
    const rightTs = right.issuedAt ?? "";
    if (leftTs !== rightTs) return leftTs.localeCompare(rightTs);
    return left.date.localeCompare(right.date);
  })[0] ?? null;
}

const NWS_API = "https://api.weather.gov";
const MAX_PRODUCTS_TO_SCAN = 24;
const MAX_HISTORY_DAYS = 30;

export interface NwsCliLoadOptions {
  icao: string;
  date?: string;
  days?: number;
  fetchImpl?: typeof fetch;
  userAgent?: string;
}

interface NwsProductSummary {
  id: string;
  issuanceTime?: string;
  "@id"?: string;
}

function nwsHeaders(userAgent: string): HeadersInit {
  return {
    Accept: "application/geo+json, application/json",
    "User-Agent": userAgent,
  };
}

async function fetchJson(
  fetchImpl: typeof fetch,
  url: string,
  userAgent: string,
): Promise<unknown> {
  const response = await fetchImpl(url, { headers: nwsHeaders(userAgent) });
  if (!response.ok) {
    throw new Error(`NWS request failed (${response.status}) for ${url}`);
  }
  return response.json();
}

function graphItems(body: unknown): NwsProductSummary[] {
  if (!body || typeof body !== "object") return [];
  const graph = (body as { "@graph"?: unknown })["@graph"];
  if (!Array.isArray(graph)) return [];
  return graph.filter((item): item is NwsProductSummary => (
    !!item && typeof item === "object" && typeof (item as NwsProductSummary).id === "string"
  ));
}

function stationCwaAndCoords(body: unknown): { cwa: string | null; lat: number | null; lon: number | null } {
  if (!body || typeof body !== "object") return { cwa: null, lat: null, lon: null };
  const record = body as {
    properties?: { county?: string; forecast?: string };
    geometry?: { coordinates?: unknown };
  };
  const coords = record.geometry?.coordinates;
  let lon: number | null = null;
  let lat: number | null = null;
  if (Array.isArray(coords) && typeof coords[0] === "number" && typeof coords[1] === "number") {
    lon = coords[0];
    lat = coords[1];
  }
  return { cwa: null, lat, lon };
}

function pointsCwa(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const cwa = (body as { properties?: { cwa?: unknown } }).properties?.cwa;
  return typeof cwa === "string" && /^[A-Z]{3}$/.test(cwa) ? cwa : null;
}

export async function resolveNwsCwa(
  icao: string,
  fetchImpl: typeof fetch,
  userAgent: string,
): Promise<string> {
  const station = await fetchJson(fetchImpl, `${NWS_API}/stations/${encodeURIComponent(icao)}`, userAgent);
  const { lat, lon } = stationCwaAndCoords(station);
  if (lat == null || lon == null) {
    throw new Error(`NWS station ${icao} has no coordinates.`);
  }
  const points = await fetchJson(
    fetchImpl,
    `${NWS_API}/points/${lat.toFixed(4)},${lon.toFixed(4)}`,
    userAgent,
  );
  const cwa = pointsCwa(points);
  if (!cwa) throw new Error(`NWS CWA not found for ${icao}.`);
  return cwa;
}

function productText(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const text = (body as { productText?: unknown }).productText;
  return typeof text === "string" ? text : "";
}

function issuanceTime(body: unknown, fallback?: string): string | null {
  if (body && typeof body === "object") {
    const value = (body as { issuanceTime?: unknown }).issuanceTime;
    if (typeof value === "string") return value;
  }
  return fallback ?? null;
}

export async function loadNwsCliPrints(options: NwsCliLoadOptions): Promise<NwsCliPrintSet> {
  const icao = normalizeIcaoStation(options.icao);
  if (!icao) throw new Error("ICAO station is required.");
  const fetchImpl = options.fetchImpl ?? fetch;
  const userAgent = options.userAgent ?? NWS_CLI_USER_AGENT;
  const cliProduct = cliProductCodeForIcao(icao);
  const cwa = await resolveNwsCwa(icao, fetchImpl, userAgent);
  const listing = await fetchJson(
    fetchImpl,
    `${NWS_API}/products/types/CLI/locations/${encodeURIComponent(cwa)}`,
    userAgent,
  );
  const products = graphItems(listing).slice(0, MAX_PRODUCTS_TO_SCAN);
  const parsed: NwsCliPrint[] = [];
  for (const product of products) {
    const sourceUrl = product["@id"] ?? `${NWS_API}/products/${product.id}`;
    const body = await fetchJson(fetchImpl, sourceUrl, userAgent);
    const text = productText(body);
    if (!text.includes(cliProduct) && !text.includes(icao) && !text.includes(icao.slice(1))) {
      continue;
    }
    const print = parseNwsCliProductText(text, {
      icao,
      issuedAt: issuanceTime(body, product.issuanceTime),
      productId: product.id,
      sourceUrl,
    });
    if (print && print.cliProduct === cliProduct) parsed.push(print);
  }

  const days = options.days && Number.isFinite(options.days)
    ? Math.min(Math.max(Math.trunc(options.days), 1), MAX_HISTORY_DAYS)
    : null;

  let prints: NwsCliPrint[];
  if (options.date) {
    const first = firstFinalCliPrint(parsed, options.date);
    prints = first ? [first] : [];
  } else if (days) {
    const byDate = new Map<string, NwsCliPrint>();
    for (const print of parsed) {
      if (print.printKind !== "final") continue;
      const existing = byDate.get(print.date);
      if (!existing) {
        byDate.set(print.date, print);
        continue;
      }
      const chosen = firstFinalCliPrint([existing, print], print.date);
      if (chosen) byDate.set(print.date, chosen);
    }
    prints = [...byDate.values()]
      .sort((left, right) => right.date.localeCompare(left.date))
      .slice(0, days)
      .sort((left, right) => left.date.localeCompare(right.date));
  } else {
    const first = firstFinalCliPrint(parsed);
    prints = first ? [first] : [];
  }

  return {
    provider: NWS_CLI_PROVIDER_ID,
    seriesId: icao,
    icao,
    prints,
  };
}
