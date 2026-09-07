import { createThrottledFetch, httpFetch } from "gloomberb/utils";
import { withConnectionRequest } from "gloomberb/plugins";
import { findBbox } from "./bbox";
import { parseDigitTrafficPayloadIncremental, parseOpenSkyPayloadIncremental } from "./parse";
import {
  DIGITRAFFIC_CONNECTION_ID,
  OPENSKY_CONNECTION_ID,
  type GeoBbox,
  type TrafficKind,
  type TrafficVehicle,
} from "./types";

const CLIENT = createThrottledFetch({
  requestsPerMinute: 12,
  maxRetries: 2,
  timeoutMs: 15_000,
  backoffBaseMs: 500,
  dedupeGetRequests: true,
  defaultHeaders: {
    Accept: "application/json",
    "User-Agent": "gloomberb-traffic",
  },
  transport: (url, init) => {
    if (url.startsWith("/")) return globalThis.fetch(url, init);
    return httpFetch(url, init);
  },
});

async function readJson(url: string): Promise<unknown> {
  const response = await CLIENT.fetch(url);
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json();
}

function openskyUrl(bbox: GeoBbox): string {
  const world = bbox.id === "world";
  const search = world
    ? ""
    : new URLSearchParams({
      lamin: String(bbox.lamin),
      lomin: String(bbox.lomin),
      lamax: String(bbox.lamax),
      lomax: String(bbox.lomax),
    }).toString();
  return `https://opensky-network.org/api/states/all${search ? `?${search}` : ""}`;
}

export async function loadAircraft(
  bboxId: string,
  options?: { onPartial?: (rows: TrafficVehicle[]) => void },
): Promise<TrafficVehicle[]> {
  const url = openskyUrl(findBbox(bboxId));
  return withConnectionRequest(OPENSKY_CONNECTION_ID, "states", async () =>
    parseOpenSkyPayloadIncremental(await readJson(url), { onPartial: options?.onPartial })
  );
}

export async function loadShips(
  options?: { onPartial?: (rows: TrafficVehicle[]) => void },
): Promise<TrafficVehicle[]> {
  return withConnectionRequest(DIGITRAFFIC_CONNECTION_ID, "ais", async () =>
    parseDigitTrafficPayloadIncremental(
      await readJson("https://meri.digitraffic.fi/api/ais/v1/locations"),
      { onPartial: options?.onPartial },
    )
  );
}

export async function loadTraffic(
  kind: TrafficKind,
  bboxId: string,
  options?: { onPartial?: (rows: TrafficVehicle[]) => void },
): Promise<TrafficVehicle[]> {
  return kind === "aircraft" ? loadAircraft(bboxId, options) : loadShips(options);
}
