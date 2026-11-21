import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";
import { FIBA_CONFIG, type BasketballEvent } from "./events";
import { playByPlayRows } from "./columns";
import { perGame, periodAverages, seasonLineups, seasonTotals, teamGameRows, winLoss } from "./season";
import { computeBoxScore } from "./stats";

let seq = 0;
function ev(e: Partial<BasketballEvent> & Pick<BasketballEvent, "type" | "payload">): BasketballEvent {
  seq++;
  return {
    id: `e${seq}`, gameId: "g", seq, period: 1, clockMs: 600_000, side: "us",
    playerId: null, deleted: false, ...e,
  } as BasketballEvent;
}

const five = ["a", "b", "c", "d", "e"];

function game(usPts: number, oppPts: number) {
  return computeBoxScore([
    ev({ type: "period_start", payload: { lineup: five } }),
    ev({ type: "shot", clockMs: 500_000, playerId: "a", payload: { points: 2, made: true } }),
    ...(usPts > 2 ? [ev({ type: "shot", clockMs: 400_000, playerId: "b", payload: { points: 3, made: true } })] : []),
    ev({ type: "shot", clockMs: 300_000, side: "opp", payload: { points: oppPts as 1 | 2 | 3, made: true } }),
    ev({ type: "period_end", clockMs: 0, payload: {} }),
  ]);
}

describe("season aggregation", () => {
  const g1 = game(5, 3);
  const g2 = game(2, 3);

  it("sums lines and counts games played", () => {
    const t = seasonTotals([g1, g2]);
    expect(t.a).toMatchObject({ gp: 2, pts: 4, fgm: 2 });
    expect(t.b).toMatchObject({ gp: 2, pts: 3 });
    expect(perGame(t.a).pts).toBe(2);
    expect(perGame(t.b).pts).toBe(1.5);
  });

  it("builds a W/L record and shooting splits", () => {
    const base = { teamId: "t", sport: "basketball", startsAt: null, status: "final" as const, config: FIBA_CONFIG, scorekeeperId: null };
    const rows = teamGameRows([
      { game: { ...base, id: "1", opponentName: "A" }, box: g1 },
      { game: { ...base, id: "2", opponentName: "B" }, box: g2 },
    ]);
    expect(rows.map((r) => r.result)).toEqual(["W", "L"]);
    expect(rows[0].fgPct).toBe(100);
    expect(winLoss(rows)).toEqual({ w: 1, l: 1, t: 0 });
  });

  it("averages points by period", () => {
    const avg = periodAverages([g1, g2], 4);
    expect(avg[0]).toEqual({ period: 1, us: 3.5, opp: 3, games: 2 });
    expect(avg[1].games).toBe(0);
  });

  it("tracks five-man lineup plus/minus over time", () => {
    const units = seasonLineups([g1, g2], 60);
    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({ seconds: 1200, pointsFor: 7, pointsAgainst: 6, plusMinus: 1 });
  });
});

describe("csv", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(toCsv([["a", 'say "hi"', "x,y", null, 3]])).toBe('a,"say ""hi""","x,y",,3');
  });

  it("writes a running score in the play-by-play", () => {
    const events = [
      ev({ type: "period_start", payload: { lineup: five } }),
      ev({ type: "shot", playerId: "a", payload: { points: 3, made: true } }),
    ];
    const rows = playByPlayRows(events, [{ id: "a", teamId: "t", name: "Ann", jersey: "4", active: true }], FIBA_CONFIG, "Rivals");
    expect(rows[2]).toEqual(["Q1", "10:00", "Us", "Ann", "3PT made", "3-0"]);
  });
});
