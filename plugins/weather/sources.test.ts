import { afterEach, describe, expect, mock, test } from "bun:test";
import type { GloomPluginContext } from "gloomberb/types/plugin";
import {
  NWS_CLI_CONNECTION_ID,
  NWS_OBSERVATIONS_CONNECTION_ID,
  WEATHER_CONNECTION_ID,
} from "./types";

/**
 * The connection registry lives in the host app and is not part of the public
 * `gloomberb/*` surface, so `createConnection` from `gloomberb/plugins` is
 * mocked here. This still guards the plugin-side contract: only the owned
 * international feeds are registered, and the Adjacent Cloud children
 * (twc-kalshi, nws-cli) are skipped.
 *
 * `./sources` is imported dynamically after the mock is installed because
 * `mock.module` only applies to modules imported after it is called.
 */
type ConnectionCall = { id: string; name: string; kind?: string; authRequired?: boolean };

const createConnectionMock = mock((_ctx: GloomPluginContext, options: ConnectionCall) => {
  return () => undefined;
});

mock.module("gloomberb/plugins", () => ({
  createConnection: createConnectionMock,
}));

const {
  WEATHER_SOURCE_DEFS,
  weatherSourceDef,
  HKO_RAINFALL_CONNECTION_ID,
  WEATHER_UNDERGROUND_CONNECTION_ID,
  registerWeatherSources,
} = await import("./sources");

const registeredCalls = () => createConnectionMock.mock.calls.map((call) => call[1]);

describe("weather source metadata", () => {
  test("lists every weather feed in priority order", () => {
    const ids = WEATHER_SOURCE_DEFS.map((def) => def.id);
    expect(ids).toEqual([
      WEATHER_CONNECTION_ID,
      NWS_CLI_CONNECTION_ID,
      NWS_OBSERVATIONS_CONNECTION_ID,
      HKO_RAINFALL_CONNECTION_ID,
      WEATHER_UNDERGROUND_CONNECTION_ID,
    ]);
    expect(WEATHER_SOURCE_DEFS.map((def) => def.priority)).toEqual(
      [...WEATHER_SOURCE_DEFS.map((def) => def.priority)].sort((a, b) => a - b),
    );
  });

  test("HKO is keyless and Weather Underground requires an API key", () => {
    expect(weatherSourceDef(HKO_RAINFALL_CONNECTION_ID)?.authRequired).toBe(false);
    expect(weatherSourceDef(WEATHER_UNDERGROUND_CONNECTION_ID)?.authRequired).toBe(true);
  });
});

describe("weather source registration", () => {
  afterEach(() => {
    createConnectionMock.mockClear();
  });

  test("registerWeatherSources only registers the owned international feeds", () => {
    const disposers = registerWeatherSources({} as GloomPluginContext);
    const ids = registeredCalls().map((call) => call.id);
    expect(ids).toContain(HKO_RAINFALL_CONNECTION_ID);
    expect(ids).toContain(WEATHER_UNDERGROUND_CONNECTION_ID);
    expect(ids).toContain(NWS_OBSERVATIONS_CONNECTION_ID);
    // Adjacent Cloud children are not re-registered as their own rows.
    expect(ids).not.toContain(WEATHER_CONNECTION_ID);
    expect(ids).not.toContain(NWS_CLI_CONNECTION_ID);
    for (const dispose of disposers) dispose();
  });

  test("Weather Underground registers as auth-required", () => {
    const disposers = registerWeatherSources({} as GloomPluginContext);
    const wu = registeredCalls().find((call) => call.id === WEATHER_UNDERGROUND_CONNECTION_ID);
    expect(wu?.authRequired).toBe(true);
    for (const dispose of disposers) dispose();
  });
});
