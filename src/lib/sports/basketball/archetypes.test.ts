import { describe, expect, it } from "vitest";
import {
  archetypeRating,
  benchmarkFor,
  benchmarkScore,
  DEFAULT_ARCHETYPES,
  DEFAULT_BENCHMARKS,
  detectArchetype,
  GOAL_RING,
  type Archetype,
} from "./archetypes";
import { metricByKey } from "./metrics";

describe("benchmarks", () => {
  it("uses the team's override, else the default", () => {
    expect(benchmarkFor("tsPct", {})).toBe(DEFAULT_BENCHMARKS.tsPct);
    expect(benchmarkFor("tsPct", { tsPct: 60 })).toBe(60);
    expect(benchmarkFor("nope", {})).toBeNull();
  });

  it("puts hitting the target on the goal ring, capped at 100", () => {
    expect(benchmarkScore(50, 50)).toBe(GOAL_RING);
    expect(benchmarkScore(25, 50)).toBe(37.5);
    expect(benchmarkScore(500, 50)).toBe(100);
    expect(benchmarkScore(null, 50)).toBeNull();
    expect(benchmarkScore(10, null)).toBeNull();
  });

  it("inverts lower-is-better metrics", () => {
    expect(benchmarkScore(15, 15, true)).toBe(GOAL_RING);
    expect(benchmarkScore(30, 15, true)).toBe(37.5); // twice the turnovers → half the score
    expect(benchmarkScore(0, 15, true)).toBe(100);
  });

  it("handles zero or negative targets without dividing", () => {
    expect(benchmarkScore(0, 0)).toBe(GOAL_RING);
    expect(benchmarkScore(4, 0)).toBe(85);
    expect(benchmarkScore(-4, 0)).toBe(65);
  });
});

describe("archetypes", () => {
  it("every default archetype only uses metrics that exist", () => {
    for (const a of DEFAULT_ARCHETYPES) for (const m of a.metrics) expect(metricByKey(m.key), `${a.name}: ${m.key}`).toBeDefined();
    for (const key of Object.keys(DEFAULT_BENCHMARKS)) expect(metricByKey(key), key).toBeDefined();
  });

  const shooter: Archetype = { id: "s", name: "Shooter", description: "", metrics: [{ key: "tsPct", goal: 55 }, { key: "efgPct", goal: 50 }] };
  const defender: Archetype = { id: "d", name: "Defender", description: "", metrics: [{ key: "stlPct", goal: 3 }, { key: "blkPct", goal: 2 }] };

  it("rates a player as the mean of their key-stat percentiles, 0–99", () => {
    const pct = (k: string) => ({ tsPct: 100, efgPct: 80, stlPct: 20, blkPct: 10 })[k] ?? null;
    expect(archetypeRating(shooter, pct)).toBe(89); // (100 + 80) / 2 × 0.99
    expect(archetypeRating(defender, pct)).toBe(15);
  });

  it("needs at least half the key stats to rate", () => {
    const pct = (k: string) => (k === "tsPct" ? 90 : null);
    expect(archetypeRating(shooter, pct)).toBe(89);
    const three: Archetype = { ...shooter, metrics: [...shooter.metrics, { key: "threePaRate", goal: 40 }] };
    expect(archetypeRating(three, pct)).toBeNull();
  });

  it("detects the best-fitting archetype", () => {
    const pct = (k: string) => ({ tsPct: 30, efgPct: 40, stlPct: 90, blkPct: 70 })[k] ?? null;
    expect(detectArchetype([shooter, defender], pct)?.archetype.name).toBe("Defender");
    expect(detectArchetype([shooter, defender], () => null)).toBeNull();
  });
});
