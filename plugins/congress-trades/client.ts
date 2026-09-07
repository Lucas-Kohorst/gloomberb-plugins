import { httpFetch } from "gloomberb/utils";
import { withConnectionRequest } from "gloomberb/plugins";
import { CONGRESS_CONNECTION_ID } from "./connection";
import {
  CONGRESS_API_BASE_URL,
  type CloudCongressHouseParams,
  type CloudCongressHousePayload,
} from "./types";

function congressHousePath(params: CloudCongressHouseParams = {}): string {
  const search = new URLSearchParams();
  if (params.year != null) search.set("year", String(params.year));
  if (params.limit != null) search.set("limit", String(params.limit));
  if (params.offset != null) search.set("offset", String(params.offset));
  if (params.filingLimit != null) search.set("filingLimit", String(params.filingLimit));
  if (params.filingOffset != null) search.set("filingOffset", String(params.filingOffset));
  if (params.member) search.set("member", params.member);
  if (params.ticker) search.set("ticker", params.ticker);
  if (params.refresh != null) search.set("refresh", String(params.refresh));
  const query = search.toString();
  return query ? `/cloud/congress/house?${query}` : "/cloud/congress/house";
}

/**
 * Fetches House PTR filings/members from the Gloom Cloud congressional
 * endpoint. Every request is reported to the Connections pane through
 * `withConnectionRequest`, keyed by the operation that issued it.
 */
export async function fetchCongressHouse(
  params: CloudCongressHouseParams,
  operation = "house",
): Promise<CloudCongressHousePayload> {
  const url = `${CONGRESS_API_BASE_URL}${congressHousePath(params)}`;
  return withConnectionRequest(CONGRESS_CONNECTION_ID, operation, async () => {
    const response = await httpFetch(url);
    if (!response.ok) {
      throw new Error(`Congress trades request failed: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as CloudCongressHousePayload;
  });
}
