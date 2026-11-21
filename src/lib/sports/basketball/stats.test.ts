import { describe, expect, it } from "vitest";
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
    clockMs: 600_000,
    side: "us",
    playerId: null,
    deleted: false,
    ...e,
  } as BasketballEvent;
}

const lineup = ["a", "b", "c", "d", "e"];

describe("computeBoxScore", () => {
  it("scores shots, shooting splits and team score", () => {
    const box = computeBoxScore([
      ev({ type: "period_start", payload: { lineup } }),
      ev({ type: "shot", playerId: "a", payload: { points: 3, made: true } }),
      ev({ type: "shot", playerId: "a", payload: { points: 2, made: false } }),
      ev({ type: "shot", playerId: "b", payload: { points: 1, made: true } }),
      ev({ type: "shot", side: "opp", payload: { points: 2, made: true } }),
    ]);
    expect(box.score).toEqual({ us: 4, opp: 2 });
    expect(box.players.a).toMatchObject({ pts: 3, fgm: 1, fga: 2, tpm: 1, tpa: 1 });
    expect(box.players.b).toMatchObject({ pts: 1, ftm: 1, fta: 1, fga: 0 });
    expect(box.scoreByPeriod.us).toEqual([4]);
  });

  it("tracks minutes and plus/minus through substitutions", () => {
    const box = computeBoxScore([
      ev({ type: "period_start", clockMs: 600_000, payload: { lineup } }),
      ev({ type: "shot", clockMs: 540_000, playerId: "a", payload: { points: 2, made: true } }),
      ev({ type: "sub", clockMs: 300_000, payload: { playerIn: "f", playerOut: "a" } }),
      ev({ type: "shot", clockMs: 200_000, side: "opp", payload: { points: 3, made: true } }),
      ev({ type: "period_end", clockMs: 0, payload: {} }),
    ]);
    expect(box.players.a.secondsPlayed).toBe(300);
    expect(box.players.f.secondsPlayed).toBe(300);
    expect(box.players.b.secondsPlayed).toBe(600);
    expect(box.players.a.plusMinus).toBe(2);
    expect(box.players.f.plusMinus).toBe(-3);
    expect(box.players.b.plusMinus).toBe(-1);
    expect(box.onCourt).toContain("f");
    expect(box.onCourt).not.toContain("a");
  });

  it("ignores deleted events and orders by seq", () => {
    const start = ev({ type: "period_start", payload: { lineup } });
    const made = ev({ type: "shot", playerId: "a", payload: { points: 2, made: true } });
    const undone = { ...ev({ type: "shot", playerId: "a", payload: { points: 3, made: true } }), deleted: true };
    const box = computeBoxScore([made, undone, start]);
    expect(box.score.us).toBe(2);
    expect(box.players.a.pts).toBe(2);
  });

  it("counts team fouls per period for both sides", () => {
    const box = computeBoxScore([
      ev({ type: "period_start", payload: { lineup } }),
      ev({ type: "foul", playerId: "c", payload: {} }),
      ev({ type: "foul", side: "opp", payload: {} }),
      ev({ type: "period_start", period: 2, payload: { lineup } }),
      ev({ type: "foul", period: 2, side: "opp", payload: {} }),
    ]);
    expect(box.foulsByPeriod.us).toEqual([1]);
    expect(box.foulsByPeriod.opp).toEqual([1, 1]);
    expect(box.players.c.pf).toBe(1);
  });
});
