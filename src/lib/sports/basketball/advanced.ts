/**
 * Advanced stats for the Analysis tab (see docs/analysis-plan.md).
 *
 * Everything is derived from box scores (which come from the event log). Two kinds of stat:
 * - "all games" stats use only our own plays, so every game counts.
 * - possession-based stats (pace, ratings, rebound/steal/block %) need the opponent's misses,
 *   rebounds and turnovers, so they only use games recorded with config.opponentStats.
 *
 * Percentages are 0–100. Anything without enough data is null, never 0 or NaN.
 */
import { emptyLine, emptyOnCourtLine, emptyTeamLine, addTeamLine, type BoxScore, type OnCourtLine, type PlayerLine, type TeamLine } from "./stats";

/** One game as the analysis needs it. */
export interface AnalysisGame {
  box: BoxScore;
  /** True when opponent misses/rebounds/turnovers were recorded. */
  opponentStats: boolean;
}

/** A full high-school game is 4 × 8 minutes. */
export const MINUTES_PER_GAME = 32;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** a / b, or null when b is 0 (or negative, which can only come from bad data). */
const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);
const pct = (a: number, b: number): number | null => {
  const r = div(a, b);
  return r === null ? null : r * 100;
};

/** Estimated possessions for one side: FGA + 0.44·FTA − OREB + TOV. */
export function possessions(t: TeamLine): number {
  return Math.max(0, t.fga + 0.44 * t.fta - t.oreb + t.tov);
}

/** Possessions in a stretch of play: the average of both sides' estimates. */
export function gamePossessions(team: { us: TeamLine; opp: TeamLine }): number {
  return (possessions(team.us) + possessions(team.opp)) / 2;
}

const PLAYER_KEYS = Object.keys(emptyLine()) as (keyof PlayerLine)[];
const addLine = (a: PlayerLine, b: PlayerLine) => {
  for (const k of PLAYER_KEYS) a[k] += b[k];
};
const addOnCourt = (a: OnCourtLine, b: OnCourtLine) => {
  addTeamLine(a.team.us, b.team.us);
  addTeamLine(a.team.opp, b.team.opp);
  a.pointsFor += b.pointsFor;
  a.pointsAgainst += b.pointsAgainst;
};

/** Seconds with five of ours on court, i.e. the game time that was tracked. */
export const trackedSeconds = (box: BoxScore) =>
  Object.values(box.lineups).reduce((s, l) => s + l.seconds, 0);

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

/** Totals over a set of games. */
export interface Bucket {
  gp: number;
  line: PlayerLine;
  on: OnCourtLine;
  /** Team totals and tracked seconds for the games in this bucket (for on/off). */
  teamWhenPlayed: OnCourtLine;
  teamSecondsWhenPlayed: number;
}

export interface PlayerAgg {
  /** Every game the player appeared in. */
  all: Bucket;
  /** Only games with opponent stats. */
  full: Bucket;
}

const emptyBucket = (): Bucket => ({
  gp: 0,
  line: emptyLine(),
  on: emptyOnCourtLine(),
  teamWhenPlayed: emptyOnCourtLine(),
  teamSecondsWhenPlayed: 0,
});

/** Team context of a whole game as an OnCourtLine (both sides' totals and points). */
const wholeGame = (box: BoxScore): OnCourtLine => ({
  team: { us: { ...box.team.us }, opp: { ...box.team.opp } },
  pointsFor: box.score.us,
  pointsAgainst: box.score.opp,
});

/** Sums every player's lines across games, keeping opponent-stat games separately too. */
export function aggregatePlayers(games: readonly AnalysisGame[]): Record<string, PlayerAgg> {
  const out: Record<string, PlayerAgg> = {};
  for (const { box, opponentStats } of games) {
    const whole = wholeGame(box);
    const seconds = trackedSeconds(box);
    for (const [id, line] of Object.entries(box.players)) {
      const agg = (out[id] ??= { all: emptyBucket(), full: emptyBucket() });
      const buckets = opponentStats ? [agg.all, agg.full] : [agg.all];
      for (const b of buckets) {
        b.gp++;
        addLine(b.line, line);
        addOnCourt(b.on, box.onCourtTeam[id] ?? emptyOnCourtLine());
        addOnCourt(b.teamWhenPlayed, whole);
        b.teamSecondsWhenPlayed += seconds;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Player advanced stats
// ---------------------------------------------------------------------------

export interface PlayerAdvanced {
  minutes: number;
  gp: number;
  /** Games with opponent stats that feed the possession-based numbers. */
  gpFull: number;
  // Shooting efficiency
  efgPct: number | null;
  tsPct: number | null;
  threePaRate: number | null;
  ftRate: number | null;
  /** Points per scoring attempt (FGA + 0.44·FTA). */
  pointsPerShot: number | null;
  // Usage & playmaking
  usgPct: number | null;
  astPct: number | null;
  astToRatio: number | null;
  tovPct: number | null;
  // Rebounding & defense (opponent-stat games only)
  orebPct: number | null;
  drebPct: number | null;
  rebPct: number | null;
  stlPct: number | null;
  blkPct: number | null;
  // Impact
  plusMinusPer32: number | null;
  onOrtg: number | null;
  onDrtg: number | null;
  onNetRtg: number | null;
  offNetRtg: number | null;
  /** On-court net rating minus off-court net rating. */
  onOffNet: number | null;
  // Overall
  gameScore: number;
  gameScorePer32: number | null;
}

/** Hollinger's Game Score: a one-number summary of a box-score line. */
export function gameScore(l: PlayerLine): number {
  return (
    l.pts + 0.4 * l.fgm - 0.7 * l.fga - 0.4 * (l.fta - l.ftm) + 0.7 * l.oreb + 0.3 * l.dreb + l.stl +
    0.7 * l.ast + 0.7 * l.blk - 0.4 * l.pf - l.tov
  );
}

/** Offensive / defensive / net rating (points per 100 possessions) for a stretch of play. */
export function ratings(c: OnCourtLine) {
  const poss = gamePossessions(c.team);
  const ortg = poss > 0 ? (100 * c.pointsFor) / poss : null;
  const drtg = poss > 0 ? (100 * c.pointsAgainst) / poss : null;
  return { possessions: poss, ortg, drtg, net: ortg !== null && drtg !== null ? ortg - drtg : null };
}

export function playerAdvanced(agg: PlayerAgg): PlayerAdvanced {
  const { all, full } = agg;
  const l = all.line;
  const minutes = l.secondsPlayed / 60;
  const scoringAttempts = l.fga + 0.44 * l.fta;
  const usOn = all.on.team.us;

  // Rebounds, steals, blocks: only opponent-stat games have the denominators.
  const f = full.line;
  const fOn = full.on.team;
  const orebChances = fOn.us.oreb + fOn.opp.dreb;
  const drebChances = fOn.us.dreb + fOn.opp.oreb;

  const on = full.gp > 0 ? ratings(full.on) : null;
  const offCourt: OnCourtLine = {
    team: {
      us: subtract(full.teamWhenPlayed.team.us, full.on.team.us),
      opp: subtract(full.teamWhenPlayed.team.opp, full.on.team.opp),
    },
    pointsFor: full.teamWhenPlayed.pointsFor - full.on.pointsFor,
    pointsAgainst: full.teamWhenPlayed.pointsAgainst - full.on.pointsAgainst,
  };
  const off = full.gp > 0 ? ratings(offCourt) : null;

  const gs = gameScore(l);
  return {
    minutes,
    gp: all.gp,
    gpFull: full.gp,
    efgPct: pct(l.fgm + 0.5 * l.tpm, l.fga),
    tsPct: pct(l.pts, 2 * scoringAttempts),
    threePaRate: pct(l.tpa, l.fga),
    ftRate: pct(l.fta, l.fga),
    pointsPerShot: div(l.pts, scoringAttempts),
    usgPct: pct(scoringAttempts + l.tov, usOn.fga + 0.44 * usOn.fta + usOn.tov),
    astPct: pct(l.ast, usOn.fgm - l.fgm),
    astToRatio: div(l.ast, l.tov),
    tovPct: pct(l.tov, scoringAttempts + l.tov),
    orebPct: pct(f.oreb, orebChances),
    drebPct: pct(f.dreb, drebChances),
    rebPct: pct(f.oreb + f.dreb, orebChances + drebChances),
    stlPct: pct(f.stl, possessions(fOn.opp)),
    blkPct: pct(f.blk, fOn.opp.fga - fOn.opp.tpa),
    plusMinusPer32: minutes > 0 ? (l.plusMinus / minutes) * MINUTES_PER_GAME : null,
    onOrtg: on?.ortg ?? null,
    onDrtg: on?.drtg ?? null,
    onNetRtg: on?.net ?? null,
    offNetRtg: off?.net ?? null,
    onOffNet: on?.net != null && off?.net != null ? on.net - off.net : null,
    gameScore: gs,
    gameScorePer32: minutes > 0 ? (gs / minutes) * MINUTES_PER_GAME : null,
  };
}

function subtract(a: TeamLine, b: TeamLine): TeamLine {
  const out = emptyTeamLine();
  for (const k of Object.keys(out) as (keyof TeamLine)[]) out[k] = a[k] - b[k];
  return out;
}

// ---------------------------------------------------------------------------
// Units for counting stats
// ---------------------------------------------------------------------------

export type Unit = "per32" | "perGame" | "per100" | "total";

export const UNIT_LABELS: Record<Unit, string> = {
  per32: "Per 32 min",
  perGame: "Per game",
  per100: "Per 100 poss.",
  total: "Totals",
};

/** Box-score stats that can be shown in any unit. */
export type CountingStat = Exclude<keyof PlayerLine, "secondsPlayed">;

/**
 * A counting stat in the chosen unit. Per 100 possessions uses only opponent-stat games
 * (possessions need both sides), so it's null for players with none of those.
 */
export function inUnit(agg: PlayerAgg, stat: CountingStat, unit: Unit): number | null {
  const { all, full } = agg;
  switch (unit) {
    case "total":
      return all.line[stat];
    case "perGame":
      return div(all.line[stat], all.gp);
    case "per32": {
      const r = div(all.line[stat], all.line.secondsPlayed / 60);
      return r === null ? null : r * MINUTES_PER_GAME;
    }
    case "per100": {
      const r = div(full.line[stat], gamePossessions(full.on.team));
      return r === null ? null : r * 100;
    }
  }
}

// ---------------------------------------------------------------------------
// Percentiles (roster-wide) and the minimum-minutes rule
// ---------------------------------------------------------------------------

export interface PercentileInput {
  id: string;
  value: number | null;
  minutes: number;
}

/** Default minimum: 20% of the team's tracked minutes. */
export function defaultMinMinutes(games: readonly AnalysisGame[]): number {
  const teamMinutes = games.reduce((s, g) => s + trackedSeconds(g.box), 0) / 60;
  return Math.round(teamMinutes * 0.2);
}

/**
 * Percentile (0–100) of each eligible player's value among eligible teammates.
 * Players under minMinutes, or with no value, get null. Ties share the same percentile.
 * With lowerIsBetter (e.g. turnover %), the lowest value ranks highest.
 */
export function percentiles(
  rows: readonly PercentileInput[],
  minMinutes: number,
  lowerIsBetter = false,
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  const pool = rows.filter((r) => r.value !== null && r.minutes >= minMinutes);
  for (const r of rows) out[r.id] = null;
  const n = pool.length;
  for (const r of pool) {
    const v = r.value as number;
    let below = 0;
    let equal = 0;
    for (const o of pool) {
      const ov = o.value as number;
      if (lowerIsBetter ? ov > v : ov < v) below++;
      else if (ov === v) equal++;
    }
    // Mid-rank of the tie group, scaled so the best is 100 and the worst is 0.
    out[r.id] = n === 1 ? 100 : ((below + (equal - 1) / 2) / (n - 1)) * 100;
  }
  return out;
}

/**
 * Where a single value would rank (0–100) among a pool of values, e.g. a player's earlier form
 * placed on the same scale as the current team pool.
 */
export function percentileOf(value: number | null, pool: readonly number[], lowerIsBetter = false): number | null {
  if (value === null || pool.length === 0) return null;
  let below = 0;
  let equal = 0;
  for (const p of pool) {
    if (lowerIsBetter ? p > value : p < value) below++;
    else if (p === value) equal++;
  }
  return ((below + equal / 2) / pool.length) * 100;
}

/** School seasons run August → July; returns e.g. "2026–27". */
export function seasonOf(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  const start = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
  return `${start}–${String((start + 1) % 100).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Team stats
// ---------------------------------------------------------------------------

export interface FourFactors {
  efgPct: number | null;
  tovPct: number | null;
  orebPct: number | null;
  ftRate: number | null;
}

export interface TeamAdvanced {
  gamesTotal: number;
  /** Games with opponent stats, used for everything below except tsPct/efg (us). */
  gamesFull: number;
  /** Possessions per 32 minutes. */
  pace: number | null;
  ortg: number | null;
  drtg: number | null;
  netRtg: number | null;
  tsPct: number | null;
  us: FourFactors;
  opp: FourFactors;
}

function fourFactors(own: TeamLine, other: TeamLine): FourFactors {
  return {
    efgPct: pct(own.fgm + 0.5 * own.tpm, own.fga),
    tovPct: pct(own.tov, own.fga + 0.44 * own.fta + own.tov),
    orebPct: pct(own.oreb, own.oreb + other.dreb),
    ftRate: pct(own.fta, own.fga),
  };
}

/** Season (or filtered) team stats. Possession-based numbers only use opponent-stat games. */
export function teamAdvanced(games: readonly AnalysisGame[]): TeamAdvanced {
  const all = emptyOnCourtLine();
  const full = emptyOnCourtLine();
  let fullSeconds = 0;
  let gamesFull = 0;
  for (const g of games) {
    addOnCourt(all, wholeGame(g.box));
    if (g.opponentStats) {
      addOnCourt(full, wholeGame(g.box));
      fullSeconds += trackedSeconds(g.box);
      gamesFull++;
    }
  }
  const r = gamesFull > 0 ? ratings(full) : null;
  const us = all.team.us;
  const paceRaw = div(r?.possessions ?? 0, fullSeconds / 60);
  return {
    gamesTotal: games.length,
    gamesFull,
    pace: paceRaw === null ? null : paceRaw * MINUTES_PER_GAME,
    ortg: r?.ortg ?? null,
    drtg: r?.drtg ?? null,
    netRtg: r?.net ?? null,
    tsPct: pct(all.pointsFor, 2 * (us.fga + 0.44 * us.fta)),
    us: gamesFull > 0 ? fourFactors(full.team.us, full.team.opp) : emptyFactors(),
    opp: gamesFull > 0 ? fourFactors(full.team.opp, full.team.us) : emptyFactors(),
  };
}

const emptyFactors = (): FourFactors => ({ efgPct: null, tovPct: null, orebPct: null, ftRate: null });

/** One point per game for the Team trends chart; possession numbers are null for older games. */
export interface TeamGamePoint {
  pace: number | null;
  ortg: number | null;
  drtg: number | null;
  netRtg: number | null;
  efgPct: number | null;
  tsPct: number | null;
}

export function teamGameTrend(game: AnalysisGame): TeamGamePoint {
  const t = teamAdvanced([game]);
  return { pace: t.pace, ortg: t.ortg, drtg: t.drtg, netRtg: t.netRtg, efgPct: fourFactors(game.box.team.us, game.box.team.opp).efgPct, tsPct: t.tsPct };
}

// ---------------------------------------------------------------------------
// Duos and lineups
// ---------------------------------------------------------------------------

export interface UnitStats {
  players: string[];
  seconds: number;
  plusMinus: number;
  /** Net rating from opponent-stat games only; null if the unit never played in one. */
  netRtg: number | null;
}

function unitStats(
  games: readonly AnalysisGame[],
  keyOf: (players: string[]) => string[][],
  minSeconds: number,
): UnitStats[] {
  const acc = new Map<string, { players: string[]; seconds: number; plusMinus: number; full: OnCourtLine; hasFull: boolean }>();
  for (const { box, opponentStats } of games) {
    for (const l of Object.values(box.lineups)) {
      if (l.players.length !== 5) continue;
      for (const players of keyOf(l.players)) {
        const key = players.join("|");
        const a = acc.get(key) ?? { players, seconds: 0, plusMinus: 0, full: emptyOnCourtLine(), hasFull: false };
        a.seconds += l.seconds;
        a.plusMinus += l.pointsFor - l.pointsAgainst;
        if (opponentStats) {
          addOnCourt(a.full, { team: l.team, pointsFor: l.pointsFor, pointsAgainst: l.pointsAgainst });
          a.hasFull = true;
        }
        acc.set(key, a);
      }
    }
  }
  return [...acc.values()]
    .filter((a) => a.seconds >= minSeconds)
    .map((a) => ({
      players: a.players,
      seconds: a.seconds,
      plusMinus: a.plusMinus,
      netRtg: a.hasFull ? ratings(a.full).net : null,
    }))
    .sort((x, y) => (y.netRtg ?? -Infinity) - (x.netRtg ?? -Infinity) || y.plusMinus - x.plusMinus);
}

/** Every pair of teammates who shared the court, best net rating first. */
export function duos(games: readonly AnalysisGame[], minSeconds = 120): UnitStats[] {
  return unitStats(
    games,
    (five) => {
      const sorted = [...five].sort();
      const pairs: string[][] = [];
      for (let i = 0; i < sorted.length; i++)
        for (let j = i + 1; j < sorted.length; j++) pairs.push([sorted[i], sorted[j]]);
      return pairs;
    },
    minSeconds,
  );
}

/** Five-player lineups, best net rating first. */
export function lineupRatings(games: readonly AnalysisGame[], minSeconds = 120): UnitStats[] {
  return unitStats(games, (five) => [[...five].sort()], minSeconds);
}
