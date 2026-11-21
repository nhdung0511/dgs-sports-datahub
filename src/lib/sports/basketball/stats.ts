import { liveEvents, type Side } from "../types";
import type { BasketballEvent } from "./events";

export interface PlayerLine {
  pts: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  oreb: number;
  dreb: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  plusMinus: number;
  secondsPlayed: number;
}

export interface BoxScore {
  score: Record<Side, number>;
  /** Points per period, index 0 = period 1. */
  scoreByPeriod: Record<Side, number[]>;
  /** Team fouls per period (for bonus tracking). */
  foulsByPeriod: Record<Side, number[]>;
  players: Record<string, PlayerLine>;
  onCourt: string[];
  /** Five-player units, keyed by sorted player ids joined with "|". */
  lineups: Record<string, LineupLine>;
  /**
   * Team totals per side, including plays with no player (all opponent plays are team-level).
   * Opponent misses/rebounds/turnovers only exist for games with config.opponentStats.
   */
  team: Record<Side, TeamLine>;
}

export interface TeamLine {
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  oreb: number;
  dreb: number;
  tov: number;
  pf: number;
}

export const emptyTeamLine = (): TeamLine => ({
  fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, tov: 0, pf: 0,
});

export interface LineupLine {
  players: string[];
  seconds: number;
  pointsFor: number;
  pointsAgainst: number;
}

export const lineupKey = (ids: Iterable<string>) => [...ids].sort().join("|");

export function emptyLine(): PlayerLine {
  return {
    pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0,
    oreb: 0, dreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
    plusMinus: 0, secondsPlayed: 0,
  };
}

function bump(arr: number[], period: number, by: number) {
  while (arr.length < period) arr.push(0);
  arr[period - 1] += by;
}

/**
 * Derives the full box score from the event log. Pure: same log → same result,
 * so undo/edit/offline-sync only ever touch the log.
 */
export function computeBoxScore(events: readonly BasketballEvent[]): BoxScore {
  const box: BoxScore = {
    score: { us: 0, opp: 0 },
    scoreByPeriod: { us: [], opp: [] },
    foulsByPeriod: { us: [], opp: [] },
    players: {},
    onCourt: [],
    lineups: {},
    team: { us: emptyTeamLine(), opp: emptyTeamLine() },
  };
  const line = (id: string) => (box.players[id] ??= emptyLine());
  const unit = () => {
    const key = lineupKey(onCourt);
    return (box.lineups[key] ??= {
      players: key.split("|"),
      seconds: 0,
      pointsFor: 0,
      pointsAgainst: 0,
    });
  };

  let onCourt = new Set<string>();
  let lastClockMs: number | null = null;
  let period = 0;

  for (const ev of liveEvents(events)) {
    // Credit floor time to whoever was on court since the previous event.
    if (lastClockMs !== null && ev.period === period) {
      const elapsed = lastClockMs - ev.clockMs;
      if (elapsed > 0 && onCourt.size > 0) {
        for (const id of onCourt) line(id).secondsPlayed += elapsed / 1000;
        unit().seconds += elapsed / 1000;
      }
    }
    if (ev.period === period || ev.type === "period_start") lastClockMs = ev.clockMs;

    const mine = ev.side === "us" && ev.playerId ? line(ev.playerId) : null;
    const side = box.team[ev.side];

    // Team totals: every shot/rebound/turnover/foul, with or without a player.
    switch (ev.type) {
      case "shot": {
        const { points, made } = ev.payload;
        if (points === 1) {
          side.fta++;
          if (made) side.ftm++;
        } else {
          side.fga++;
          if (made) side.fgm++;
          if (points === 3) {
            side.tpa++;
            if (made) side.tpm++;
          }
        }
        break;
      }
      case "rebound":
        if (ev.payload.offensive) side.oreb++;
        else side.dreb++;
        break;
      case "turnover":
        side.tov++;
        break;
      case "foul":
        side.pf++;
        break;
    }

    switch (ev.type) {
      case "period_start":
        period = ev.period;
        onCourt = new Set(ev.payload.lineup);
        onCourt.forEach(line);
        break;
      case "period_end":
        lastClockMs = null;
        break;
      case "sub":
        onCourt.delete(ev.payload.playerOut);
        onCourt.add(ev.payload.playerIn);
        line(ev.payload.playerIn);
        break;
      case "shot": {
        const { points, made } = ev.payload;
        if (mine) {
          if (points === 1) {
            mine.fta++;
            if (made) mine.ftm++;
          } else {
            mine.fga++;
            if (made) mine.fgm++;
            if (points === 3) {
              mine.tpa++;
              if (made) mine.tpm++;
            }
          }
          if (made) mine.pts += points;
        }
        if (made) {
          box.score[ev.side] += points;
          bump(box.scoreByPeriod[ev.side], ev.period, points);
          const sign = ev.side === "us" ? 1 : -1;
          for (const id of onCourt) line(id).plusMinus += sign * points;
          if (onCourt.size > 0) {
            if (ev.side === "us") unit().pointsFor += points;
            else unit().pointsAgainst += points;
          }
        }
        break;
      }
      case "rebound":
        if (mine) {
          if (ev.payload.offensive) mine.oreb++;
          else mine.dreb++;
          mine.reb++;
        }
        break;
      case "foul":
        bump(box.foulsByPeriod[ev.side], ev.period, 1);
        if (mine) mine.pf++;
        break;
      case "assist":
        if (mine) mine.ast++;
        break;
      case "steal":
        if (mine) mine.stl++;
        break;
      case "block":
        if (mine) mine.blk++;
        break;
      case "turnover":
        if (mine) mine.tov++;
        break;
      case "timeout":
        break;
    }
  }

  box.onCourt = [...onCourt];
  return box;
}
