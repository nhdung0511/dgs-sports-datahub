/**
 * "Plays like" NBA comparisons for the player profile.
 *
 * School and NBA numbers live on different levels, so we compare *style*, not output:
 * pace-free rates only, each player standardised (z-scored) within their own pool: a school
 * player against their teammates, an NBA player against the league's rotation players.
 * Then the nearest NBA players by distance across the style stats are the comps.
 */
import type { PlayerAdvanced } from "./advanced";

export const STYLE_KEYS = ["usgPct", "astPct", "tovPct", "threePaRate", "ftRate", "orebPct", "drebPct", "stlPct", "blkPct"] as const;
export type StyleKey = (typeof STYLE_KEYS)[number];
export type StyleVector = Record<StyleKey, number | null>;

export const STYLE_LABELS: Record<StyleKey, { label: string; help: string }> = {
  usgPct: { label: "Usage", help: "Share of team plays used while on court" },
  astPct: { label: "Playmaking", help: "Share of teammates' baskets assisted (AST%)" },
  tovPct: { label: "Turnovers", help: "Turnovers per 100 plays used (TOV%)" },
  threePaRate: { label: "3-pt volume", help: "Share of shots that are threes (3PA rate)" },
  ftRate: { label: "Gets to the line", help: "Free throws per shot (FT rate)" },
  orebPct: { label: "Off. boards", help: "Share of available offensive rebounds (OREB%)" },
  drebPct: { label: "Def. boards", help: "Share of available defensive rebounds (DREB%)" },
  stlPct: { label: "Steals", help: "Steals per 100 opponent possessions (STL%)" },
  blkPct: { label: "Blocks", help: "Share of opponent 2-pt shots blocked (BLK%)" },
};

export interface NbaPlayer extends StyleVector {
  id: number;
  name: string;
  team: string;
  minutes: number;
  gp: number;
  /** Points per 36 minutes. */
  pts: number | null;
  tsPct: number | null;
}

export interface NbaSnapshot {
  season: string;
  source: string;
  minMinutes: number;
  generated: string;
  players: NbaPlayer[];
}

export const styleOf = (adv: PlayerAdvanced): StyleVector =>
  Object.fromEntries(STYLE_KEYS.map((k) => [k, adv[k]])) as StyleVector;

interface Dist {
  mean: number;
  sd: number;
}
export type PoolStats = Record<StyleKey, Dist | null>;

/** Mean and standard deviation of each style stat over a pool (nulls skipped). */
export function poolStats(pool: readonly StyleVector[]): PoolStats {
  const out = {} as PoolStats;
  for (const k of STYLE_KEYS) {
    const vals = pool.map((v) => v[k]).filter((x): x is number => x !== null && Number.isFinite(x));
    if (vals.length === 0) {
      out[k] = null;
      continue;
    }
    const mean = vals.reduce((s, x) => s + x, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((s, x) => s + (x - mean) ** 2, 0) / vals.length);
    out[k] = { mean, sd };
  }
  return out;
}

/**
 * A small roster gives a shaky spread, so the team's numbers are pulled toward the NBA's
 * spread, as if `prior` extra league players were in the pool. The team mean stays its own
 * (that is the level gap we want to remove).
 */
export function blendPool(team: PoolStats, teamSize: number, nba: PoolStats, prior = 4): PoolStats {
  const out = {} as PoolStats;
  for (const k of STYLE_KEYS) {
    const t = team[k];
    const n = nba[k];
    if (!t) out[k] = null;
    else if (!n) out[k] = t;
    else out[k] = { mean: t.mean, sd: Math.sqrt((teamSize * t.sd ** 2 + prior * n.sd ** 2) / (teamSize + prior)) };
  }
  return out;
}

const z = (v: number | null, d: Dist | null) => (v === null || !d || d.sd === 0 ? null : (v - d.mean) / d.sd);

/** Normal CDF → percentile 0–100, for "where they sit in their own pool". */
export function zToPct(zv: number | null): number | null {
  if (zv === null) return null;
  // Abramowitz–Stegun approximation of erf.
  const x = Math.abs(zv) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return Math.round(50 * (1 + Math.sign(zv) * erf));
}

export interface StyleRow {
  key: StyleKey;
  ours: number | null;
  theirs: number | null;
  /** Percentile within each player's own pool. */
  oursPct: number | null;
  theirsPct: number | null;
  /** Absolute z difference (smaller = more alike). */
  gap: number | null;
}

export interface Comp {
  nba: NbaPlayer;
  /** 0–100. */
  similarity: number;
  rows: StyleRow[];
}

export type Confidence = "Low" | "Medium" | "High";

/** How much to trust comps, from minutes played in the chosen games. */
export function confidenceOf(minutes: number): Confidence {
  if (minutes < 60) return "Low";
  if (minutes < 200) return "Medium";
  return "High";
}

/**
 * The k NBA players closest in style. `team` is every teammate's style vector in the same games
 * (including this player), for standardising. Stats that are null for the player (e.g. rebound %
 * without opponent stats) are left out of the distance.
 */
export function nbaComps(player: StyleVector, team: readonly StyleVector[], nba: readonly NbaPlayer[], k = 3): Comp[] {
  const nbaStats = poolStats(nba);
  const teamStats = blendPool(poolStats(team), team.length, nbaStats);
  const ours = Object.fromEntries(STYLE_KEYS.map((key) => [key, z(player[key], teamStats[key])])) as Record<StyleKey, number | null>;
  const used = STYLE_KEYS.filter((key) => ours[key] !== null);
  if (used.length === 0) return [];

  return nba
    .map((p) => {
      let sum = 0;
      let n = 0;
      const rows: StyleRow[] = STYLE_KEYS.map((key) => {
        const theirZ = z(p[key], nbaStats[key]);
        const gap = ours[key] !== null && theirZ !== null ? Math.abs(ours[key]! - theirZ) : null;
        if (gap !== null) {
          sum += gap ** 2;
          n++;
        }
        return { key, ours: player[key], theirs: p[key], oursPct: zToPct(ours[key]), theirsPct: zToPct(theirZ), gap };
      });
      const dist = n > 0 ? Math.sqrt(sum / n) : Infinity;
      return { nba: p, similarity: Math.round(100 * Math.exp(-(dist ** 2) / 2)), rows, dist };
    })
    .sort((a, b) => a.dist - b.dist)
    .slice(0, k)
    .map(({ nba: p, similarity, rows }) => ({ nba: p, similarity, rows }));
}
