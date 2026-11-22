import { describe, expect, it } from "vitest";
import { analyzeGame, buildBaseline, elapsedSec, lineupRows, liveRates, teamRates } from "./coach";
import { alertHistory, coachAlerts, defaultThresholds, mergeThresholds } from "./coach-alerts";
import type { BasketballConfig, BasketballEvent } from "./events";
import { computeBoxScore } from "./stats";

const HS: BasketballConfig = { periodCount: 4, periodLengthSec: 480, overtimeLengthSec: 240, opponentStats: true };

let seq = 0;
function ev(e: Partial<BasketballEvent> & Pick<BasketballEvent, "type" | "payload">): BasketballEvent {
  seq++;
  return { id: `e${seq}`, gameId: "g1", seq, period: 1, clockMs: 480_000, side: "us", playerId: null, deleted: false, ...e } as BasketballEvent;
}
const lineup = ["a", "b", "c", "d", "e"];
const start = (period = 1) => ev({ type: "period_start", period, clockMs: 480_000, payload: { lineup } });
const shot = (side: "us" | "opp", points: 1 | 2 | 3, made: boolean, clockMs: number, playerId: string | null = side === "us" ? "a" : null) =>
  ev({ type: "shot", side, playerId, clockMs, payload: { points, made } });
const foul = (playerId: string | null, clockMs: number, side: "us" | "opp" = "us") =>
  ev({ type: "foul", side, playerId, clockMs, payload: {} });
const name = (id: string) => id.toUpperCase();

describe("elapsedSec", () => {
  it("adds earlier periods and time used in this one", () => {
    expect(elapsedSec(HS, 1, 480_000)).toBe(0);
    expect(elapsedSec(HS, 2, 420_000)).toBe(480 + 60);
    expect(elapsedSec(HS, 5, 240_000)).toBe(4 * 480);
  });
});

describe("analyzeGame", () => {
  it("tracks runs, biggest runs and time since scoring", () => {
    const s = analyzeGame(
      [
        start(),
        shot("us", 2, true, 470_000),
        shot("opp", 3, true, 450_000),
        shot("opp", 2, true, 430_000),
        shot("us", 2, false, 420_000),
        shot("opp", 2, true, 400_000),
      ],
      HS,
    );
    expect(s.currentRun).toMatchObject({ side: "opp", points: 7, startSec: 10 });
    expect(s.biggestRun.opp?.points).toBe(7);
    expect(s.biggestRun.us?.points).toBe(2);
    expect(s.sinceScore.us).toBe(70);
    expect(s.sinceScore.opp).toBe(0);
  });

  it("measures stints from the period start or the sub", () => {
    const s = analyzeGame(
      [start(), ev({ type: "sub", clockMs: 300_000, payload: { playerIn: "f", playerOut: "a" } }), shot("us", 2, true, 240_000, "f")],
      HS,
    );
    expect(s.stintSec.b).toBe(240);
    expect(s.stintSec.f).toBe(60);
    expect(s.stintSec.a).toBeUndefined();
  });

  it("splits points and points per possession by period", () => {
    const s = analyzeGame([start(1), shot("us", 2, true, 400_000), shot("us", 2, false, 300_000), start(2), { ...shot("us", 3, true, 400_000), period: 2 }], HS);
    expect(s.periods.map((p) => p.points.us)).toEqual([2, 3]);
    expect(s.periods[0].ppp.us).toBe(1);
    expect(s.period).toBe(2);
  });

  it("counts team fouls for the current period only", () => {
    const s = analyzeGame([start(1), foul("a", 400_000), foul("b", 390_000), start(2), { ...foul("c", 400_000), period: 2 }], HS);
    expect(s.teamFouls.us).toBe(1);
  });
});

describe("thresholds", () => {
  it("scale with the format", () => {
    expect(defaultThresholds(HS)).toMatchObject({ foulOut: 5, penaltyAfter: 4 });
    expect(defaultThresholds({ periodCount: 4, periodLengthSec: 720, overtimeLengthSec: 300 }).foulOut).toBe(6);
    expect(defaultThresholds({ periodCount: 2, periodLengthSec: 1200, overtimeLengthSec: 300 }).penaltyAfter).toBe(6);
  });

  it("merge valid overrides only", () => {
    const t = mergeThresholds(HS, { runPoints: 10, foulOut: "x", bogus: 3, coldGap: -1 });
    expect(t.runPoints).toBe(10);
    expect(t.foulOut).toBe(5);
    expect(t.coldGap).toBe(15);
  });
});

describe("coachAlerts", () => {
  const t = defaultThresholds(HS);

  it("flags foul trouble early and the last foul", () => {
    const s = analyzeGame([start(), foul("a", 470_000), foul("a", 460_000), foul("b", 450_000)], HS);
    const ids = coachAlerts(s, HS, t, null, name).map((a) => a.id);
    expect(ids).toContain("foul-trouble:a"); // 2 fouls in Q1
    expect(ids).not.toContain("foul-trouble:b");

    const late = analyzeGame([start(), ...[1, 2, 3, 4].map((i) => foul("c", 480_000 - i * 1000))], HS);
    expect(coachAlerts(late, HS, t, null, name).find((a) => a.id === "foul-last:c")?.level).toBe("high");
  });

  it("flags the bonus both ways", () => {
    const s = analyzeGame(
      [start(), ...[1, 2, 3, 4].map((i) => foul("a", 480_000 - i * 1000)), ...[1, 2, 3, 4].map((i) => foul(null, 470_000 - i * 1000, "opp"))],
      HS,
    );
    const ids = coachAlerts(s, HS, t, null, name).map((a) => a.id);
    expect(ids).toContain("penalty-opp:1");
    expect(ids).toContain("penalty-us:1");
  });

  it("flags opponent runs and sorts high first", () => {
    const s = analyzeGame([start(), ...[1, 2, 3, 4].map((i) => shot("opp", 2, true, 480_000 - i * 5000))], HS);
    const alerts = coachAlerts(s, HS, t, null, name);
    expect(alerts[0]).toMatchObject({ level: "high", text: expect.stringContaining("8-0") });
  });

  it("flags long stints and cold shooters against their baseline", () => {
    const prev = computeBoxScore([start(), shot("us", 2, true, 470_000), shot("us", 2, true, 460_000), shot("us", 2, false, 450_000)]);
    const baseline = buildBaseline([{ box: prev, opponentStats: true }]);
    const s = analyzeGame([start(), ...[1, 2, 3, 4, 5].map((i) => shot("us", 2, false, 480_000 - i * 1000)), shot("us", 2, false, 100_000)], HS);
    const ids = coachAlerts(s, HS, t, baseline, name).map((a) => a.id);
    expect(ids).toContain("cold:a");
    expect(ids).toContain("stint:a"); // 380 s ≥ 6 min
  });

  it("history records when each alert first fired", () => {
    const events = [start(), foul("a", 470_000), foul("a", 460_000)];
    const hist = alertHistory(events.length, (i) => analyzeGame(events.slice(0, i), HS), (s) => coachAlerts(s, HS, t, null, name));
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ id: "foul-trouble:a", firstAt: 3, active: true });
  });
});

describe("rates", () => {
  it("live and baseline use the same team maths", () => {
    const box = computeBoxScore([start(), shot("us", 3, true, 470_000), shot("us", 2, false, 460_000), shot("opp", 2, true, 450_000)]);
    const live = liveRates(box, true);
    expect(live.team.efgPct).toBeCloseTo(75);
    expect(live.team).toEqual(teamRates([{ box, opponentStats: true }]));
    expect(live.players.a.fgPct).toBe(50);
  });

  it("baseline keeps only the last N games when asked", () => {
    const a = computeBoxScore([start(), shot("us", 2, true, 470_000)]);
    const b = computeBoxScore([start(), shot("us", 2, false, 470_000)]);
    expect(buildBaseline([a, b].map((box) => ({ box, opponentStats: true })), 1).team.efgPct).toBe(100);
  });

  it("lineup rows put the current five first", () => {
    const s = analyzeGame([start(), shot("us", 2, true, 400_000), ev({ type: "sub", clockMs: 300_000, payload: { playerIn: "f", playerOut: "a" } }), shot("opp", 2, true, 200_000)], HS);
    const rows = lineupRows(s, true);
    expect(rows[0].current).toBe(true);
    expect(rows[0].players).toContain("f");
    expect(rows[1].plusMinus).toBe(2);
  });
});
