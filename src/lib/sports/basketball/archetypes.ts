/**
 * Benchmarks and archetypes (stage 4 of docs/analysis-plan.md).
 *
 * - Benchmarks: a target value per metric ("a good school player"). Counting stats are per 32 min.
 * - Archetypes: a role (Shooter, Playmaker, ...) defined by a few key metrics, each with a goal.
 * - A player's archetype is either assigned by a coach or auto-detected from their stats.
 * - Archetype rating (0–99): the average of the player's team percentiles on their archetype's
 *   key metrics, so a great Defender isn't marked down for not scoring.
 *
 * The defaults below are starting points; admins can change them for their team.
 */
import type { PlayerAdvanced, PlayerAgg } from "./advanced";
import { metricByKey, type Metric } from "./metrics";

/** Default targets for school basketball. Counting stats are per 32 minutes. */
export const DEFAULT_BENCHMARKS: Record<string, number> = {
  pts: 14,
  reb: 7,
  oreb: 2.5,
  dreb: 4.5,
  ast: 3,
  stl: 1.8,
  blk: 0.8,
  tov: 2,
  pf: 2.5,
  fga: 12,
  tpa: 4,
  fta: 3,
  efgPct: 48,
  tsPct: 52,
  threePaRate: 33,
  ftRate: 30,
  pointsPerShot: 1.05,
  usgPct: 20,
  astPct: 15,
  astToRatio: 1.5,
  tovPct: 15,
  orebPct: 8,
  drebPct: 15,
  rebPct: 11,
  stlPct: 2.5,
  blkPct: 2,
  plusMinusPer32: 3,
  onNetRtg: 5,
  onOffNet: 3,
  gameScorePer32: 10,
};

export interface ArchetypeMetric {
  key: string;
  goal: number;
}

export interface Archetype {
  /** Database id, or "default-<slug>" for a built-in one the team hasn't saved yet. */
  id: string;
  name: string;
  description: string;
  metrics: ArchetypeMetric[];
}

export const DEFAULT_ARCHETYPES: Archetype[] = [
  {
    id: "default-shooter",
    name: "Shooter",
    description: "Scores efficiently, especially from three.",
    metrics: [
      { key: "tsPct", goal: 55 },
      { key: "efgPct", goal: 50 },
      { key: "threePaRate", goal: 40 },
      { key: "tpa", goal: 5 },
      { key: "pointsPerShot", goal: 1.1 },
      { key: "tovPct", goal: 12 },
    ],
  },
  {
    id: "default-playmaker",
    name: "Playmaker",
    description: "Creates shots for teammates and protects the ball.",
    metrics: [
      { key: "astPct", goal: 25 },
      { key: "astToRatio", goal: 2 },
      { key: "ast", goal: 4.5 },
      { key: "tovPct", goal: 15 },
      { key: "usgPct", goal: 20 },
      { key: "stl", goal: 1.5 },
    ],
  },
  {
    id: "default-slasher",
    name: "Slasher",
    description: "Attacks the rim, draws fouls and carries the scoring load.",
    metrics: [
      { key: "fta", goal: 5 },
      { key: "ftRate", goal: 40 },
      { key: "pts", goal: 15 },
      { key: "usgPct", goal: 24 },
      { key: "pointsPerShot", goal: 1.05 },
      { key: "orebPct", goal: 6 },
    ],
  },
  {
    id: "default-big",
    name: "Rebounder / Big",
    description: "Owns the boards and protects the paint.",
    metrics: [
      { key: "rebPct", goal: 15 },
      { key: "orebPct", goal: 10 },
      { key: "drebPct", goal: 20 },
      { key: "reb", goal: 9 },
      { key: "blkPct", goal: 3 },
      { key: "efgPct", goal: 50 },
    ],
  },
  {
    id: "default-defender",
    name: "Defender",
    description: "Disrupts opponents and makes the team better on defense.",
    metrics: [
      { key: "stlPct", goal: 3 },
      { key: "blkPct", goal: 2.5 },
      { key: "stl", goal: 2.5 },
      { key: "dreb", goal: 5 },
      { key: "onNetRtg", goal: 5 },
      { key: "pf", goal: 3 },
    ],
  },
];

/** The team's target for a metric: its own value if set, else the default. */
export function benchmarkFor(key: string, overrides: Record<string, number>): number | null {
  return overrides[key] ?? DEFAULT_BENCHMARKS[key] ?? null;
}

/**
 * Where a value sits against its target on a 0–100 radar scale: hitting the target is 75
 * (the "goal" ring), double the target is capped at 100. Lower-is-better metrics are inverted.
 */
export const GOAL_RING = 75;
export function benchmarkScore(value: number | null, target: number | null, lowerIsBetter = false): number | null {
  if (value === null || target === null) return null;
  if (target <= 0) {
    // Targets at or below zero (e.g. a net rating) can't be scaled by ratio.
    const hit = lowerIsBetter ? value <= target : value >= target;
    const gap = Math.abs(value - target);
    return Math.max(0, Math.min(100, hit ? GOAL_RING + gap * 2.5 : GOAL_RING - gap * 2.5));
  }
  if (lowerIsBetter) {
    if (value <= 0) return 100;
    return Math.max(0, Math.min(100, (GOAL_RING * target) / value));
  }
  return Math.max(0, Math.min(100, (GOAL_RING * value) / target));
}

/** Metric definitions for an archetype's key stats (unknown keys dropped). */
export function archetypeMetrics(a: Archetype): { metric: Metric; goal: number }[] {
  return a.metrics.flatMap((m) => {
    const metric = metricByKey(m.key);
    return metric ? [{ metric, goal: m.goal }] : [];
  });
}

/**
 * How well a player fits an archetype, 0–99: the mean of their team percentiles on its key
 * metrics. Null when fewer than half of those metrics have a percentile (not enough data).
 * percentileOf(metricKey) returns the player's team percentile for that metric.
 */
export function archetypeRating(a: Archetype, percentileOf: (key: string) => number | null): number | null {
  const keys = archetypeMetrics(a).map((m) => m.metric.key);
  if (keys.length === 0) return null;
  const vals = keys.map(percentileOf).filter((v): v is number => v !== null);
  if (vals.length * 2 < keys.length) return null;
  return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 0.99);
}

/** The archetype a player fits best (highest rating), or null without enough data. */
export function detectArchetype(
  archetypes: readonly Archetype[],
  percentileOf: (key: string) => number | null,
): { archetype: Archetype; rating: number } | null {
  let best: { archetype: Archetype; rating: number } | null = null;
  for (const a of archetypes) {
    const rating = archetypeRating(a, percentileOf);
    if (rating !== null && (!best || rating > best.rating)) best = { archetype: a, rating };
  }
  return best;
}

/** A metric's value for the benchmark view: counting stats are always per 32 min there. */
export function benchmarkValue(m: Metric, agg: PlayerAgg, adv: PlayerAdvanced): number | null {
  return m.value(agg, adv, "per32");
}
