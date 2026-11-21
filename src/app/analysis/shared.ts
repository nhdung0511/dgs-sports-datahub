import {
  aggregatePlayers,
  percentiles,
  playerAdvanced,
  type AnalysisGame,
  type PlayerAdvanced,
  type PlayerAgg,
  type Unit,
} from "@/lib/sports/basketball/advanced";
import type { Metric } from "@/lib/sports/basketball/metrics";
import type { BoxScore } from "@/lib/sports/basketball/stats";
import type { Player } from "@/lib/sports/types";

/** A finished game as the Analysis tab receives it from the server. */
export interface AnalysisGameData {
  id: string;
  opponent: string;
  date: string | null;
  opponentStats: boolean;
  box: BoxScore;
}

export interface PlayerRow {
  player: Player;
  agg: PlayerAgg;
  adv: PlayerAdvanced;
  /** Played at least the minimum minutes, so they count in percentiles. */
  eligible: boolean;
}

/** Shared state every view gets. */
export interface ViewProps {
  rows: PlayerRow[];
  games: AnalysisGameData[];
  unit: Unit;
  minMinutes: number;
  nameOf: (id: string) => string;
}

export const toAnalysisGames = (games: readonly AnalysisGameData[]): AnalysisGame[] =>
  games.map((g) => ({ box: g.box, opponentStats: g.opponentStats }));

/** One row per roster player who appeared in the selected games, most minutes first. */
export function buildRows(players: readonly Player[], games: readonly AnalysisGameData[], minMinutes: number): PlayerRow[] {
  const aggs = aggregatePlayers(toAnalysisGames(games));
  return players
    .filter((p) => aggs[p.id])
    .map((player) => {
      const agg = aggs[player.id];
      const adv = playerAdvanced(agg);
      return { player, agg, adv, eligible: adv.minutes >= minMinutes };
    })
    .sort((a, b) => b.adv.minutes - a.adv.minutes);
}

/** Roster percentile of every row for one metric (null below the minimum or with no value). */
export function metricPercentiles(rows: readonly PlayerRow[], m: Metric, unit: Unit, minMinutes: number) {
  return percentiles(
    rows.map((r) => ({ id: r.player.id, value: m.value(r.agg, r.adv, unit), minutes: r.adv.minutes })),
    minMinutes,
    m.lowerIsBetter,
  );
}

/**
 * Cell tint for a percentile: diverging blue (high) ↔ neutral ↔ orange (low), so it never
 * relies on red/green. The number is always printed too, so colour is never the only cue.
 */
export function pctTint(p: number | null | undefined): string | undefined {
  if (p === null || p === undefined) return undefined;
  const d = (p - 50) / 50;
  const pole = d >= 0 ? "--pct-high" : "--pct-low";
  return `color-mix(in srgb, var(${pole}) ${Math.round(Math.abs(d) * 45)}%, transparent)`;
}

/** Validated categorical slots for compared players, in fixed order (never cycled). */
export const PLAYER_COLORS = ["var(--player-1)", "var(--player-2)", "var(--player-3)", "var(--player-4)"];

export const shortName = (p: Player) => `#${p.jersey ?? "–"} ${p.name.split(" ").slice(-1)[0]}`;
