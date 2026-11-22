/**
 * Live coach view (docs/coach-view-plan.md): game state for in-game decisions, all derived
 * from the event log so it works the same live, offline (scorer tab) and in post-game review.
 *
 * Percentages are 0–100; anything without data is null.
 */
import { liveEvents } from "../types";
import {
  aggregatePlayers,
  gamePossessions,
  MINUTES_PER_GAME,
  playerAdvanced,
  possessions,
  ratings,
  trackedSeconds,
  type AnalysisGame,
  type PlayerAdvanced,
} from "./advanced";
import { periodLengthMs, type BasketballConfig, type BasketballEvent } from "./events";
import { addTeamLine, computeBoxScore, emptyTeamLine, lineupKey, type BoxScore, type TeamLine } from "./stats";
import type { Side } from "../types";

const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);
const pct = (a: number, b: number): number | null => {
  const r = div(a, b);
  return r === null ? null : r * 100;
};

/** Seconds of game time elapsed at (period, clock remaining). */
export function elapsedSec(config: BasketballConfig, period: number, clockMs: number): number {
  let s = 0;
  for (let p = 1; p < period; p++) s += periodLengthMs(config, p) / 1000;
  return s + Math.max(0, periodLengthMs(config, period) - clockMs) / 1000;
}

// ---------------------------------------------------------------------------
// Live game state
// ---------------------------------------------------------------------------

export interface Run {
  side: Side;
  points: number;
  /** Game seconds when the run started (the other side's last score). */
  startSec: number;
}

export interface PeriodSplit {
  period: number;
  points: Record<Side, number>;
  /** Points per possession; opponent's only with opponent stats. */
  ppp: Record<Side, number | null>;
  team: Record<Side, TeamLine>;
}

export interface CoachState {
  box: BoxScore;
  /** Live events used, in order. */
  events: BasketballEvent[];
  period: number;
  inPeriod: boolean;
  clockMs: number;
  /** Game seconds at the latest play. */
  nowSec: number;
  currentRun: Run | null;
  biggestRun: Record<Side, Run | null>;
  /** Seconds since each side last scored (null if they haven't). */
  sinceScore: Record<Side, number | null>;
  /** Seconds each of our on-court players has been on since they last came in (or the period started). */
  stintSec: Record<string, number>;
  /** Team fouls in the current period. */
  teamFouls: Record<Side, number>;
  periods: PeriodSplit[];
}

export function analyzeGame(all: readonly BasketballEvent[], config: BasketballConfig): CoachState {
  const events = liveEvents(all);
  const box = computeBoxScore(events);
  const at = (e: BasketballEvent) => elapsedSec(config, e.period, e.clockMs);

  let period = 0;
  let inPeriod = false;
  let clockMs = periodLengthMs(config, 1);
  let nowSec = 0;
  let currentRun: Run | null = null;
  const biggestRun: Record<Side, Run | null> = { us: null, opp: null };
  const lastScore: Record<Side, number | null> = { us: null, opp: null };
  const stintStart: Record<string, number> = {};
  const byPeriod = new Map<number, BasketballEvent[]>();

  for (const e of events) {
    const t = at(e);
    nowSec = Math.max(nowSec, t);
    clockMs = e.clockMs;
    if (!byPeriod.has(e.period)) byPeriod.set(e.period, []);
    byPeriod.get(e.period)!.push(e);

    switch (e.type) {
      case "period_start":
        period = e.period;
        inPeriod = true;
        for (const k of Object.keys(stintStart)) delete stintStart[k];
        for (const id of e.payload.lineup) stintStart[id] = t;
        break;
      case "period_end":
        inPeriod = false;
        break;
      case "sub":
        delete stintStart[e.payload.playerOut];
        stintStart[e.payload.playerIn] = t;
        break;
      case "shot":
        if (!e.payload.made) break;
        lastScore[e.side] = t;
      {
        const prev: Run | null = currentRun;
        const run: Run =
          prev && prev.side === e.side
            ? { side: prev.side, points: prev.points + e.payload.points, startSec: prev.startSec }
            : { side: e.side, points: e.payload.points, startSec: lastScore[e.side === "us" ? "opp" : "us"] ?? 0 };
        currentRun = run;
        if (run.points > (biggestRun[e.side]?.points ?? 0)) biggestRun[e.side] = run;
        break;
      }
    }
  }

  const stintSec: Record<string, number> = {};
  for (const id of box.onCourt) stintSec[id] = Math.max(0, nowSec - (stintStart[id] ?? nowSec));

  const periods: PeriodSplit[] = [...byPeriod.entries()]
    .sort(([a], [b]) => a - b)
    .map(([p, evs]) => {
      const b = computeBoxScore(evs);
      return {
        period: p,
        points: b.score,
        team: b.team,
        ppp: { us: div(b.score.us, possessions(b.team.us)), opp: div(b.score.opp, possessions(b.team.opp)) },
      };
    });

  return {
    box,
    events,
    period,
    inPeriod,
    clockMs,
    nowSec,
    currentRun,
    biggestRun,
    sinceScore: {
      us: lastScore.us === null ? null : nowSec - lastScore.us,
      opp: lastScore.opp === null ? null : nowSec - lastScore.opp,
    },
    stintSec,
    teamFouls: {
      us: box.foulsByPeriod.us[period - 1] ?? 0,
      opp: box.foulsByPeriod.opp[period - 1] ?? 0,
    },
    periods,
  };
}

// ---------------------------------------------------------------------------
// Team rates (live game and baseline use the same maths)
// ---------------------------------------------------------------------------

export interface TeamRates {
  games: number;
  /** Points per 32 minutes of tracked play. */
  ptsPer32: number | null;
  efgPct: number | null;
  tsPct: number | null;
  threePaRate: number | null;
  ftRate: number | null;
  tovPct: number | null;
  /** Possession-based: only games with opponent stats. */
  orebPct: number | null;
  pace: number | null;
  ortg: number | null;
  drtg: number | null;
  net: number | null;
}

interface TeamSum {
  us: TeamLine;
  opp: TeamLine;
  pointsFor: number;
  pointsAgainst: number;
  seconds: number;
  games: number;
}

const emptySum = (): TeamSum => ({ us: emptyTeamLine(), opp: emptyTeamLine(), pointsFor: 0, pointsAgainst: 0, seconds: 0, games: 0 });

function addGame(s: TeamSum, box: BoxScore) {
  addTeamLine(s.us, box.team.us);
  addTeamLine(s.opp, box.team.opp);
  s.pointsFor += box.score.us;
  s.pointsAgainst += box.score.opp;
  s.seconds += trackedSeconds(box);
  s.games++;
}

export function teamRates(games: readonly AnalysisGame[]): TeamRates {
  const all = emptySum();
  const full = emptySum();
  for (const g of games) {
    addGame(all, g.box);
    if (g.opponentStats) addGame(full, g.box);
  }
  const u = all.us;
  const attempts = u.fga + 0.44 * u.fta;
  const minutes = all.seconds / 60;
  const r = full.games > 0 ? ratings({ team: { us: full.us, opp: full.opp }, pointsFor: full.pointsFor, pointsAgainst: full.pointsAgainst }) : null;
  const fullMin = full.seconds / 60;
  return {
    games: all.games,
    ptsPer32: minutes > 0 ? (all.pointsFor / minutes) * MINUTES_PER_GAME : null,
    efgPct: pct(u.fgm + 0.5 * u.tpm, u.fga),
    tsPct: pct(all.pointsFor, 2 * attempts),
    threePaRate: pct(u.tpa, u.fga),
    ftRate: pct(u.fta, u.fga),
    tovPct: pct(u.tov, attempts + u.tov),
    orebPct: full.games > 0 ? pct(full.us.oreb, full.us.oreb + full.opp.dreb) : null,
    pace: full.games > 0 && fullMin > 0 ? (gamePossessions(full) / fullMin) * MINUTES_PER_GAME : null,
    ortg: r?.ortg ?? null,
    drtg: r?.drtg ?? null,
    net: r?.net ?? null,
  };
}

// ---------------------------------------------------------------------------
// Player rates
// ---------------------------------------------------------------------------

export interface PlayerRates extends PlayerAdvanced {
  ptsPer32: number | null;
  rebPer32: number | null;
  astPer32: number | null;
  tovPer32: number | null;
  fgPct: number | null;
  fga: number;
}

export function playerRates(games: readonly AnalysisGame[]): Record<string, PlayerRates> {
  const out: Record<string, PlayerRates> = {};
  for (const [id, agg] of Object.entries(aggregatePlayers(games))) {
    const adv = playerAdvanced(agg);
    const l = agg.all.line;
    const per32 = (v: number) => (adv.minutes > 0 ? (v / adv.minutes) * MINUTES_PER_GAME : null);
    out[id] = {
      ...adv,
      ptsPer32: per32(l.pts),
      rebPer32: per32(l.reb),
      astPer32: per32(l.ast),
      tovPer32: per32(l.tov),
      fgPct: pct(l.fgm, l.fga),
      fga: l.fga,
    };
  }
  return out;
}

export interface Baseline {
  team: TeamRates;
  players: Record<string, PlayerRates>;
}

/** Baseline from previous games (pass newest first; `last` keeps only the most recent N). */
export function buildBaseline(games: readonly AnalysisGame[], last?: number): Baseline {
  const use = last ? games.slice(0, last) : games;
  return { team: teamRates(use), players: playerRates(use) };
}

/** This game's rates in the same shape as the baseline. */
export function liveRates(box: BoxScore, opponentStats: boolean): Baseline {
  const g = [{ box, opponentStats }];
  return { team: teamRates(g), players: playerRates(g) };
}

// ---------------------------------------------------------------------------
// Lineups
// ---------------------------------------------------------------------------

export interface LineupRow {
  key: string;
  players: string[];
  minutes: number;
  plusMinus: number;
  net: number | null;
  current: boolean;
}

export function lineupRows(state: CoachState, opponentStats: boolean): LineupRow[] {
  const cur = lineupKey(state.box.onCourt);
  return Object.entries(state.box.lineups)
    .filter(([, l]) => l.players.length === 5)
    .map(([key, l]) => ({
      key,
      players: l.players,
      minutes: l.seconds / 60,
      plusMinus: l.pointsFor - l.pointsAgainst,
      net: opponentStats ? ratings(l).net : null,
      current: key === cur,
    }))
    .sort((a, b) => Number(b.current) - Number(a.current) || b.minutes - a.minutes);
}
