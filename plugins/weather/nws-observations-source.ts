/**
 * NOAA/NWS station observations source, types, and fetch, inlined from the
 * first-party `src/sources/nws-observations` module so this external plugin is
 * self-contained. The host-facing `./nws-observations` wrapper re-exports the
 * pieces the pane and settlement adapters need.
 */

import { withConnectionRequest } from "gloomberb/plugins";
import { httpFetch } from "gloomberb/utils";
import { normalizeIcaoStation } from "./nws-cli-source";
import { NWS_OBSERVATIONS_CONNECTION_ID } from "./types";

export const NWS_OBSERVATIONS_PROVIDER_ID = "nws-observations";
export const NWS_OBSERVATIONS_USER_AGENT =
  "Gloomberb (https://terminal.kohor.st; nws-observations@kohor.st)";

export const NWS_API = "https://api.weather.gov";

/** A single NWS station observation record parsed from the GeoJSON API. */
export interface NwsObservation {
  provider: typeof NWS_OBSERVATIONS_PROVIDER_ID;
  stationId: string;
  icao: string;
  /** ISO-8601 UTC timestamp of the observation. */
  timestamp: string | null;
  /** Air temperature in degrees Fahrenheit, or null when missing. */
  tempF: number | null;
  /** Air temperature in degrees Celsius, or null when missing. */
  tempC: number | null;
  /** 24-hour max temperature in Fahrenheit reported in the observation, if present. */
  maxTempF24h: number | null;
  /** 24-hour min temperature in Fahrenheit reported in the observation, if present. */
  minTempF24h: number | null;
  /** Precipitation in inches for the past hour, if present. */
  precipIn: number | null;
  /** Quality control flag (e.g. "passed", "failed", "notChecked"). */
  qualityControl: string | null;
  /** Source URL of the individual observation feature. */
  sourceUrl: string | null;
}

export interface NwsObservationSet {
  provider: typeof NWS_OBSERVATIONS_PROVIDER_ID;
  stationId: string;
  icao: string;
  observations: NwsObservation[];
  fetchedAt: number;
}

/** Aggregated daily max/min/precip from a station observation timeseries. */
export interface NwsDailyAggregate {
  provider: typeof NWS_OBSERVATIONS_PROVIDER_ID;
  stationId: string;
  icao: string;
  date: string;
  /** Maximum observed temperature in Fahrenheit for the calendar date. */
  maxTempF: number | null;
  /** Minimum observed temperature in Fahrenheit for the calendar date. */
  minTempF: number | null;
  /** Total precipitation in inches for the calendar date. */
  precipIn: number | null;
  /** Number of observations that contributed to the aggregate. */
  sampleCount: number;
  /** Earliest observation timestamp included. */
  firstTimestamp: string | null;
  /** Latest observation timestamp included. */
  lastTimestamp: string | null;
  /** Source URL of the station observations listing. */
  sourceUrl: string | null;
  fetchedAt: number;
}

export interface NwsObservationLoadOptions {
  icao: string;
  /** Optional date filter (YYYY-MM-DD); when omitted all returned observations are included. */
  date?: string;
  /** Limit the number of observations fetched (NWS API default is 200). */
  limit?: number;
  fetchImpl?: typeof fetch;
  userAgent?: string;
}

/** A display-ready NWS ASOS observation, with US units for station detail. */
export interface NwsStationObservation {
  provider: typeof NWS_OBSERVATIONS_PROVIDER_ID;
  stationId: string;
  sourceUrl: string | null;
  timestamp: string;
  textDescription: string | null;
  temperatureF: number | null;
  dewpointF: number | null;
  relativeHumidity: number | null;
  windDirectionDeg: number | null;
  windSpeedMph: number | null;
  windGustMph: number | null;
  visibilityMi: number | null;
  barometricPressureInHg: number | null;
  seaLevelPressureInHg: number | null;
  precipitationLastHourIn: number | null;
  precipitationLast3HoursIn: number | null;
  precipitationLast6HoursIn: number | null;
}

export interface NwsStationObservationSet {
  provider: typeof NWS_OBSERVATIONS_PROVIDER_ID;
  seriesId: string;
  icao: string;
  observations: NwsStationObservation[];
}

export interface NwsStationObservationLoadOptions {
  icao: string;
  limit: number;
  fetchImpl?: typeof fetch;
  userAgent?: string;
}

// ---------------------------------------------------------------------------
// Pure GeoJSON parsers (from src/sources/nws-observations/parse.ts)
// ---------------------------------------------------------------------------

/**
 * Normalize a NWS GeoJSON observation feature into a flat record.
 * The NWS observations API returns temperatures in Celsius (wmoUnit:degC);
 * we convert to Fahrenheit and preserve both.
 */
export function parseNwsObservationFeature(
  feature: unknown,
  icao: string,
): NwsObservation | null {
  if (!feature || typeof feature !== "object") return null;
  const record = feature as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : null;
  const properties = record.properties;
  if (!properties || typeof properties !== "object") return null;
  const props = properties as Record<string, unknown>;

  const timestamp = typeof props.timestamp === "string" ? props.timestamp : null;
  const tempC = readQuantityValue(props.temperature, "wmoUnit:degC");
  const tempF = tempC != null ? celsiusToFahrenheit(tempC) : readQuantityValue(props.temperature, "wmoUnit:degF");
  const maxTempC24h = readQuantityValue(props.maxTemperatureLast24Hours, "wmoUnit:degC");
  const maxTempF24h = maxTempC24h != null
    ? celsiusToFahrenheit(maxTempC24h)
    : readQuantityValue(props.maxTemperatureLast24Hours, "wmoUnit:degF");
  const minTempC24h = readQuantityValue(props.minTemperatureLast24Hours, "wmoUnit:degC");
  const minTempF24h = minTempC24h != null
    ? celsiusToFahrenheit(minTempC24h)
    : readQuantityValue(props.minTemperatureLast24Hours, "wmoUnit:degF");
  const precipMm = readQuantityValue(props.precipitationLastHour, "wmoUnit:mm");
  const precipIn = precipMm != null ? mmToInches(precipMm) : readQuantityValue(props.precipitationLastHour, "wmoUnit:in");
  const qualityControl = typeof props.qualityControl === "object" && props.qualityControl !== null
    ? readString((props.qualityControl as Record<string, unknown>).qualityControl)
    : readString(props.qualityControl);

  return {
    provider: NWS_OBSERVATIONS_PROVIDER_ID,
    stationId: icao,
    icao,
    timestamp,
    tempF,
    tempC: tempC ?? celsiusFromFahrenheit(tempF),
    maxTempF24h,
    minTempF24h,
    precipIn,
    qualityControl,
    sourceUrl: id,
  };
}

export function parseNwsObservationCollection(
  body: unknown,
  icao: string,
): NwsObservation[] {
  if (!body || typeof body !== "object") return [];
  const features = (body as { features?: unknown }).features;
  if (!Array.isArray(features)) return [];
  const observations: NwsObservation[] = [];
  for (const feature of features) {
    const parsed = parseNwsObservationFeature(feature, icao);
    if (parsed) observations.push(parsed);
  }
  return observations;
}

/** Aggregate a station's observation timeseries into a daily max/min/precip. */
export function aggregateNwsDaily(
  observations: readonly NwsObservation[],
  icao: string,
  date: string,
  fetchedAt: number,
  sourceUrl: string | null,
): NwsDailyAggregate {
  let maxTempF: number | null = null;
  let minTempF: number | null = null;
  let precipTotal = 0;
  let precipSamples = 0;
  let sampleCount = 0;
  let firstTimestamp: string | null = null;
  let lastTimestamp: string | null = null;

  for (const obs of observations) {
    if (!obs.timestamp) continue;
    const obsDate = obs.timestamp.slice(0, 10);
    if (obsDate !== date) continue;
    sampleCount += 1;
    if (firstTimestamp == null || obs.timestamp < firstTimestamp) firstTimestamp = obs.timestamp;
    if (lastTimestamp == null || obs.timestamp > lastTimestamp) lastTimestamp = obs.timestamp;
    if (obs.tempF != null) {
      if (maxTempF == null || obs.tempF > maxTempF) maxTempF = obs.tempF;
      if (minTempF == null || obs.tempF < minTempF) minTempF = obs.tempF;
    }
    if (obs.precipIn != null) {
      precipTotal += obs.precipIn;
      precipSamples += 1;
    }
  }

  return {
    provider: NWS_OBSERVATIONS_PROVIDER_ID,
    stationId: icao,
    icao,
    date,
    maxTempF,
    minTempF,
    precipIn: precipSamples > 0 ? roundPrecip(precipTotal) : null,
    sampleCount,
    firstTimestamp,
    lastTimestamp,
    sourceUrl,
    fetchedAt,
  };
}

function readQuantityValue(quantity: unknown, expectedUnit: string): number | null {
  if (!quantity || typeof quantity !== "object") return null;
  const record = quantity as Record<string, unknown>;
  const value = record.value;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const unitCode = typeof record.unitCode === "string" ? record.unitCode : "";
  if (unitCode && unitCode !== expectedUnit) return null;
  return value;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function celsiusToFahrenheit(celsius: number): number {
  return Math.round((celsius * 9) / 5 + 32);
}

function celsiusFromFahrenheit(fahrenheit: number | null): number | null {
  if (fahrenheit == null) return null;
  return Math.round(((fahrenheit - 32) * 5) / 9 * 10) / 10;
}

function mmToInches(mm: number): number {
  return Math.round(mm / 25.4 * 100) / 100;
}

function roundPrecip(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// Display-ready station observations parser (from parse-station.ts)
// ---------------------------------------------------------------------------

interface Quantity {
  value?: unknown;
  unitCode?: unknown;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

function unitKey(unitCode: unknown): string {
  if (typeof unitCode !== "string") return "";
  return unitCode.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function quantity(value: unknown): { value: number; unit: string } | null {
  const direct = finiteNumber(value);
  if (direct != null) return { value: direct, unit: "" };
  const item = record(value) as Quantity | null;
  if (!item) return null;
  const numeric = finiteNumber(item.value);
  return numeric == null ? null : { value: numeric, unit: unitKey(item.unitCode) };
}

function convert(value: unknown, kind: "temperature" | "speed" | "distance" | "pressure" | "precipitation" | "humidity"): number | null {
  const input = quantity(value);
  if (!input) return null;
  const { value: numeric, unit } = input;
  if (!unit) return numeric;

  switch (kind) {
    case "temperature":
      if (/(degc|celsius|degreecelsius)$/.test(unit)) return numeric * 9 / 5 + 32;
      if (/(degf|fahrenheit|degreefahrenheit)$/.test(unit)) return numeric;
      if (/(kelvin|degk)$/.test(unit)) return (numeric - 273.15) * 9 / 5 + 32;
      return null;
    case "speed":
      if (/(kmh|kilometerperhour|kilometresperhour)$/.test(unit)) return numeric * 0.6213711922;
      if (/(ms|meterpersecond|metrepersecond)$/.test(unit)) return numeric * 2.2369362921;
      if (/(knot|knots|kt)$/.test(unit)) return numeric * 1.150779448;
      if (/(mph|mileperhour|milesperhour)$/.test(unit)) return numeric;
      return null;
    case "distance":
      if (/(meter|metre|m)$/.test(unit)) return numeric / 1609.344;
      if (/(kilometer|kilometre|km)$/.test(unit)) return numeric * 0.6213711922;
      if (/(mile|mi)$/.test(unit)) return numeric;
      if (/(foot|feet|ft)$/.test(unit)) return numeric / 5280;
      return null;
    case "pressure":
      if (/(hpa|mbar|millibar)$/.test(unit)) return numeric * 0.02952998751;
      if (/(pa|pascal|pascals)$/.test(unit)) return numeric * 0.0002952998751;
      if (/(inhg|inchofmercury)$/.test(unit)) return numeric;
      return null;
    case "precipitation":
      if (/(mm|millimeter|millimetre)$/.test(unit)) return numeric / 25.4;
      if (/(cm|centimeter|centimetre)$/.test(unit)) return numeric / 2.54;
      if (/(meter|metre|m)$/.test(unit)) return numeric * 39.37007874;
      if (/(inch|in)$/.test(unit)) return numeric;
      return null;
    case "humidity":
      if (/(percent|percentage)$/.test(unit)) return numeric;
      if (/(ratio|fraction)$/.test(unit)) return numeric * 100;
      return null;
  }
}

function direction(value: unknown): number | null {
  const numeric = quantity(value)?.value;
  if (numeric == null) return null;
  return ((numeric % 360) + 360) % 360;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Only full four-character station identifiers are accepted by this source. */
export function normalizeNwsObservationIcao(icao: string): string | null {
  const normalized = icao.trim().toUpperCase();
  return /^[A-Z0-9]{4}$/.test(normalized) ? normalized : null;
}

/** Pure parser for the GeoJSON payload returned by NWS station observations. */
export function parseNwsStationObservations(payload: unknown, icao: string): NwsStationObservationSet {
  const stationId = normalizeNwsObservationIcao(icao);
  if (!stationId) throw new Error("A four-character ICAO station is required.");
  const features = record(payload)?.features;
  const observations: NwsStationObservation[] = !Array.isArray(features) ? [] : features.flatMap((feature) => {
    const item = record(feature);
    const properties = record(item?.properties);
    const timestamp = text(properties?.timestamp);
    if (!properties || !timestamp || Number.isNaN(Date.parse(timestamp))) return [];
    return [{
      provider: NWS_OBSERVATIONS_PROVIDER_ID,
      stationId,
      sourceUrl: text(item?.id),
      timestamp,
      textDescription: text(properties.textDescription),
      temperatureF: convert(properties.temperature, "temperature"),
      dewpointF: convert(properties.dewpoint, "temperature"),
      relativeHumidity: convert(properties.relativeHumidity, "humidity"),
      windDirectionDeg: direction(properties.windDirection),
      windSpeedMph: convert(properties.windSpeed, "speed"),
      windGustMph: convert(properties.windGust, "speed"),
      visibilityMi: convert(properties.visibility, "distance"),
      barometricPressureInHg: convert(properties.barometricPressure, "pressure"),
      seaLevelPressureInHg: convert(properties.seaLevelPressure, "pressure"),
      precipitationLastHourIn: convert(properties.precipitationLastHour, "precipitation"),
      precipitationLast3HoursIn: convert(properties.precipitationLast3Hours, "precipitation"),
      precipitationLast6HoursIn: convert(properties.precipitationLast6Hours, "precipitation"),
    }];
  });

  return {
    provider: NWS_OBSERVATIONS_PROVIDER_ID,
    seriesId: stationId,
    icao: stationId,
    observations,
  };
}

// ---------------------------------------------------------------------------
// Loaders (from src/sources/nws-observations/load.ts)
// ---------------------------------------------------------------------------

function nwsHeaders(userAgent: string): HeadersInit {
  return {
    Accept: "application/geo+json",
    "User-Agent": userAgent,
  };
}

async function nwsFetchJson(
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>,
  url: string,
  userAgent: string,
): Promise<unknown> {
  const response = await withConnectionRequest(
    NWS_OBSERVATIONS_CONNECTION_ID,
    "station-observations",
    () => fetchImpl(url, { headers: nwsHeaders(userAgent) }),
  );
  if (!response.ok) {
    throw new Error(`NWS observations request failed (${response.status}) for ${url}`);
  }
  return response.json();
}

/**
 * Load NWS station observations and aggregate them into a daily max/min/precip
 * for the requested calendar date (UTC). Returns null when no observations
 * fall on that date.
 */
export async function loadNwsDailyAggregate(
  options: NwsObservationLoadOptions & { date: string },
): Promise<NwsDailyAggregate | null> {
  const icao = normalizeIcaoStation(options.icao);
  if (!icao) throw new Error("ICAO station is required.");
  const fetchImpl = options.fetchImpl ?? httpFetch;
  const userAgent = options.userAgent ?? NWS_OBSERVATIONS_USER_AGENT;
  const limit = options.limit && Number.isFinite(options.limit)
    ? Math.min(Math.max(Math.trunc(options.limit), 1), 500)
    : 200;
  const sourceUrl = `${NWS_API}/stations/${encodeURIComponent(icao)}/observations?limit=${limit}`;
  const body = await nwsFetchJson(fetchImpl, sourceUrl, userAgent);
  const observations = parseNwsObservationCollection(body, icao);
  const aggregate = aggregateNwsDaily(
    observations,
    icao,
    options.date,
    Date.now(),
    sourceUrl,
  );
  if (aggregate.sampleCount === 0) return null;
  return aggregate;
}

export function nwsStationObservationsUrl(icao: string, limit: number): string {
  return `${NWS_API}/stations/${encodeURIComponent(icao)}/observations?limit=${encodeURIComponent(String(limit))}`;
}

/** Load display-ready ASOS observations for the weather station detail view. */
export async function loadNwsStationObservations(
  options: NwsStationObservationLoadOptions,
): Promise<NwsStationObservationSet> {
  const icao = normalizeNwsObservationIcao(options.icao);
  if (!icao) throw new Error("A four-character ICAO station is required.");
  if (!Number.isFinite(options.limit) || options.limit < 1) {
    throw new Error("Observation limit must be a positive number.");
  }
  const limit = Math.min(Math.trunc(options.limit), 500);
  const fetchImpl = options.fetchImpl ?? httpFetch;
  const userAgent = options.userAgent ?? NWS_OBSERVATIONS_USER_AGENT;
  const url = nwsStationObservationsUrl(icao, limit);
  const body = await nwsFetchJson(fetchImpl, url, userAgent);
  return parseNwsStationObservations(body, icao);
}
