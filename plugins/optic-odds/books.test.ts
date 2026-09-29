import { describe, expect, test } from "bun:test";
import { pickBookBasket } from "./books";

describe("pickBookBasket", () => {
  test("prefers DraftKings, FanDuel, BetMGM, Caesars, Pinnacle in that order", () => {
    const basket = pickBookBasket([
      { id: "bet365", name: "Bet365" },
      { id: "pinnacle", name: "Pinnacle" },
      { id: "caesars", name: "Caesars" },
      { id: "betmgm", name: "BetMGM" },
      { id: "fanduel", name: "FanDuel" },
      { id: "draftkings", name: "DraftKings" },
    ]);
    expect(basket).toEqual(["draftkings", "fanduel", "betmgm", "caesars", "pinnacle"]);
  });

  test("matches preferred books by id or name case-insensitively", () => {
    const basket = pickBookBasket([
      { id: "dk", name: "DRAFTKINGS" },
      { id: "FanDuel", name: "FD" },
      { id: "mgm", name: "betmgm" },
    ]);
    expect(basket).toEqual(["dk", "FanDuel", "mgm"]);
  });

  test("fills remaining slots from leftover active books up to 5", () => {
    const basket = pickBookBasket([
      { id: "bet365", name: "Bet365" },
      { id: "pointsbet", name: "PointsBet" },
      { id: "draftkings", name: "DraftKings" },
      { id: "circa", name: "Circa" },
      { id: "fanduel", name: "FanDuel" },
      { id: "betonline", name: "BetOnline" },
    ]);
    expect(basket).toEqual(["draftkings", "fanduel", "bet365", "pointsbet", "circa"]);
  });

  test("returns every active book when fewer than 5 exist", () => {
    expect(pickBookBasket([
      { id: "bet365", name: "Bet365" },
      { id: "draftkings", name: "DraftKings" },
    ])).toEqual(["draftkings", "bet365"]);
  });
});
