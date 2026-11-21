import { describe, expect, it } from "vitest";
import {
  aggregatePlayers,
  duos,
  gameScore,
  inUnit,
  lineupRatings,
  percentiles,
  playerAdvanced,
  teamAdvanced,
  teamGameTrend,
  type AnalysisGame,
} from "./advanced";
import type { BasketballEvent } from "./events";
import { computeBoxScore } from "./stats";

let seq = 0;
function ev(e: Partial<BasketballEvent> & Pick<BasketballEvent, "type" | "payload">): BasketballEvent {
  seq++;
  return {
    id: `e${seq}`,
    gameId: "g1",
    seq,
    period: 1,
    clockMs: 480_000,
    side: "us",
    playerId: null,
    deleted: false,
    ...e,
  } as BasketballEvent;
}

/**
 * One 8-minute period, worked out by hand:
 * - a, b, c, d play all 8 min; e plays the first 4, f the last 4.
 * - Us: 4 FGA, 3 FGM (one 3), 1 OREB, 2 DREB, 1 TOV, 7 pts.
 * - Opp: 3 FGA, 1 FGM (no 3s), 2 FTA, 1 FTM, 0 OREB, 0 DREB, 1 TOV, 3 pts.
 * - Possessions: us 4 + 0 − 1 + 1 = 4; opp 3 + 0.88 − 0 + 1 = 4.88; game = 4.44.
 */
function sampleGame(): BasketballEvent[] {
  seq = 0;
  return [
    ev({ type: "period_start", payload: { lineup: ["a", "b", "c", "d", "e"] } }),
    ev({ type: "shot", playerId: "a", clockMs: 470_000, payload: { points: 3, made: true } }),
    ev({ type: "shot", side: "opp", clockMs: 460_000, payload: { points: 2, made: false } }),
    ev({ type: "rebound", playerId: "b", clockMs: 455_000, payload: { offensive: false } }),
    ev({ type: "shot", playerId: "b", clockMs: 450_000, payload: { points: 2, made: false } }),
    ev({ type: "rebound", playerId: "c", clockMs: 445_000, payload: { offensive: true } }),
    ev({ type: "shot", playerId: "c", clockMs: 440_000, payload: { points: 2, made: true } }),
    ev({ type: "assist", playerId: "a", clockMs: 440_000, payload: {} }),
    ev({ type: "shot", side: "opp", clockMs: 430_000, payload: { points: 2, made: true } }),
    ev({ type: "turnover", playerId: "a", clockMs: 420_000, payload: {} }),
    ev({ type: "sub", clockMs: 240_000, payload: { playerIn: "f", playerOut: "e" } }),
    ev({ type: "shot", side: "opp", clockMs: 230_000, payload: { points: 1, made: false } }),
    ev({ type: "shot", side: "opp", clockMs: 230_000, payload: { points: 1, made: true } }),
    ev({ type: "turnover", side: "opp", clockMs: 220_000, payload: {} }),
    ev({ type: "steal", playerId: "d", clockMs: 220_000, payload: {} }),
    ev({ type: "shot", playerId: "f", clockMs: 200_000, payload: { points: 2, made: true } }),
    ev({ type: "shot", side: "opp", clockMs: 190_000, payload: { points: 3, made: false } }),
    ev({ type: "rebound", playerId: "a", clockMs: 185_000, payload: { offensive: false } }),
    ev({ type: "period_end", clockMs: 0, payload: {} }),
  ];
}

const game = (opponentStats = true): AnalysisGame => ({ box: computeBoxScore(sampleGame()), opponentStats });

describe("box score on-court context", () => {
  it("credits both teams' plays to whoever was on court", () => {
    const box = computeBoxScore(sampleGame());
    expect(box.players.e.secondsPlayed).toBe(240);
    expect(box.players.f.secondsPlayed).toBe(240);
    expect(box.onCourtTeam.e.team.us).toMatchObject({ fga: 3, fgm: 2, oreb: 1, dreb: 1, tov: 1 });
    expect(box.onCourtTeam.e.team.opp).toMatchObject({ fga: 2, fgm: 1, fta: 0 });
    expect(box.onCourtTeam.e).toMatchObject({ pointsFor: 5, pointsAgainst: 2 });
    expect(box.onCourtTeam.f).toMatchObject({ pointsFor: 2, pointsAgainst: 1 });
  });
});

describe("player advanced stats", () => {
  const aggs = aggregatePlayers([game()]);

  it("shooting efficiency", () => {
    const a = playerAdvanced(aggs.a);
    expect(a.efgPct).toBeCloseTo(150); // (1 + 0.5·1) / 1
    expect(a.tsPct).toBeCloseTo(150); // 3 / (2 · 1)
    expect(a.threePaRate).toBe(100);
    expect(a.pointsPerShot).toBe(3);
    expect(playerAdvanced(aggs.e).efgPct).toBeNull(); // no shots
  });

  it("usage and playmaking", () => {
    const a = playerAdvanced(aggs.a);
    expect(a.usgPct).toBeCloseTo(40); // (1 FGA + 1 TOV) / (4 FGA + 1 TOV) on court
    expect(a.astPct).toBeCloseTo(50); // 1 AST / (3 team FGM − 1 own)
    expect(a.astToRatio).toBe(1);
    expect(a.tovPct).toBeCloseTo(50);
  });

  it("rebounding and defense use opponent data", () => {
    const a = playerAdvanced(aggs.a);
    expect(a.drebPct).toBeCloseTo(50); // 1 / (2 team DREB + 0 opp OREB)
    expect(a.orebPct).toBe(0); // 0 / (1 team OREB + 0 opp DREB)
    expect(playerAdvanced(aggs.d).stlPct).toBeCloseTo((1 / 4.88) * 100);
  });

  it("on/off ratings", () => {
    const a = playerAdvanced(aggs.a);
    expect(a.onOrtg).toBeCloseTo(700 / 4.44);
    expect(a.onDrtg).toBeCloseTo(300 / 4.44);
    expect(a.offNetRtg).toBeNull(); // never sat
    expect(a.onOffNet).toBeNull();
    expect(a.plusMinusPer32).toBeCloseTo(16); // +4 in 8 min

    const e = playerAdvanced(aggs.e);
    // On: us 3 poss, opp 2 → 2.5; 5 for, 2 against. Off: us 1, opp 2.88 → 1.94; 2 for, 1 against.
    expect(e.onNetRtg).toBeCloseTo(200 - 80);
    expect(e.offNetRtg).toBeCloseTo(200 / 1.94 - 100 / 1.94);
    expect(e.onOffNet).toBeCloseTo(120 - 100 / 1.94);
  });

  it("game score", () => {
    expect(playerAdvanced(aggs.a).gameScore).toBeCloseTo(2.7);
    expect(gameScore(aggs.a.all.line)).toBeCloseTo(2.7);
    expect(playerAdvanced(aggs.a).gameScorePer32).toBeCloseTo(2.7 * 4);
  });

  it("skips possession stats for games without opponent data", () => {
    const a = playerAdvanced(aggregatePlayers([game(false)]).a);
    expect(a.efgPct).toBeCloseTo(150);
    expect(a.usgPct).toBeCloseTo(40);
    expect(a.drebPct).toBeNull();
    expect(a.onNetRtg).toBeNull();
    expect(a.gpFull).toBe(0);
  });
});

describe("units", () => {
  const a = aggregatePlayers([game(), game(false)]).a;

  it("converts counting stats", () => {
    expect(inUnit(a, "pts", "total")).toBe(6);
    expect(inUnit(a, "pts", "perGame")).toBe(3);
    expect(inUnit(a, "pts", "per32")).toBeCloseTo(12); // 6 pts in 16 min
    // Per 100 possessions uses the opponent-stat game only: 3 pts in 4.44 possessions.
    expect(inUnit(a, "pts", "per100")).toBeCloseTo((3 / 4.44) * 100);
  });
});

describe("percentiles", () => {
  const rows = [
    { id: "p1", value: 10, minutes: 100 },
    { id: "p2", value: 20, minutes: 100 },
    { id: "p3", value: 20, minutes: 100 },
    { id: "p4", value: 40, minutes: 100 },
    { id: "low", value: 99, minutes: 10 },
    { id: "none", value: null, minutes: 100 },
  ];

  it("ranks eligible players, sharing ties, ignoring low minutes and missing values", () => {
    const p = percentiles(rows, 50);
    expect(p).toEqual({ p1: 0, p2: 50, p3: 50, p4: 100, low: null, none: null });
  });

  it("can rank lower values higher", () => {
    const p = percentiles(rows, 50, true);
    expect(p.p1).toBe(100);
    expect(p.p4).toBe(0);
  });
});

describe("team stats", () => {
  it("pace, ratings and four factors", () => {
    const t = teamAdvanced([game(), game(false)]);
    expect(t.gamesTotal).toBe(2);
    expect(t.gamesFull).toBe(1);
    expect(t.pace).toBeCloseTo((4.44 / 8) * 32);
    expect(t.ortg).toBeCloseTo(700 / 4.44);
    expect(t.netRtg).toBeCloseTo(400 / 4.44);
    expect(t.us.efgPct).toBeCloseTo(87.5); // (3 + 0.5) / 4
    expect(t.us.tovPct).toBeCloseTo(20); // 1 / (4 + 1)
    expect(t.us.orebPct).toBe(100);
    expect(t.opp.tovPct).toBeCloseTo((1 / 4.88) * 100);
  });

  it("game trend leaves possession stats empty for older games", () => {
    expect(teamGameTrend(game(false))).toMatchObject({ pace: null, ortg: null, netRtg: null });
    expect(teamGameTrend(game(false)).efgPct).toBeCloseTo(87.5);
    expect(teamGameTrend(game()).ortg).toBeCloseTo(700 / 4.44);
  });
});

describe("duos and lineups", () => {
  it("pairs and fives with plus/minus and net rating", () => {
    const pairs = duos([game()], 0);
    const ab = pairs.find((d) => d.players.join() === "a,b");
    expect(ab).toMatchObject({ seconds: 480, plusMinus: 4 });
    expect(pairs.find((d) => d.players.join() === "a,e")).toMatchObject({ seconds: 240, plusMinus: 3 });
    expect(pairs.find((d) => d.players.join() === "e,f")).toBeUndefined();

    const fives = lineupRatings([game()]);
    expect(fives).toHaveLength(2);
    expect(fives[0].netRtg).toBeCloseTo(120); // the e lineup: 200 − 80
  });
});
