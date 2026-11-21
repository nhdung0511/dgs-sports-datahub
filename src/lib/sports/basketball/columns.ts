import type { Cell } from "@/lib/csv";
import type { Player } from "../types";
import { describeEvent } from "./describe";
import type { BasketballConfig, BasketballEvent } from "./events";
import { formatClock } from "./clock";
import { periodLabel } from "./period";
import { emptyLine, type PlayerLine } from "./stats";

export type Column = { key: string; label: string; title: string; value: (l: PlayerLine) => string | number };

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const fmtMin = (sec: number) => Math.round(sec / 6) / 10;

/** Box-score columns, shared by every table and CSV export. */
export const BOX_COLUMNS: Column[] = [
  { key: "min", label: "MIN", title: "Minutes", value: (l) => fmtMin(l.secondsPlayed) },
  { key: "pts", label: "PTS", title: "Points", value: (l) => l.pts },
  { key: "fg", label: "FG", title: "Field goals made-attempted", value: (l) => `${l.fgm}-${l.fga}` },
  { key: "3p", label: "3P", title: "3-pointers made-attempted", value: (l) => `${l.tpm}-${l.tpa}` },
  { key: "ft", label: "FT", title: "Free throws made-attempted", value: (l) => `${l.ftm}-${l.fta}` },
  { key: "oreb", label: "OR", title: "Offensive rebounds", value: (l) => l.oreb },
  { key: "dreb", label: "DR", title: "Defensive rebounds", value: (l) => l.dreb },
  { key: "reb", label: "REB", title: "Rebounds", value: (l) => l.reb },
  { key: "ast", label: "AST", title: "Assists", value: (l) => l.ast },
  { key: "stl", label: "STL", title: "Steals", value: (l) => l.stl },
  { key: "blk", label: "BLK", title: "Blocks", value: (l) => l.blk },
  { key: "tov", label: "TO", title: "Turnovers", value: (l) => l.tov },
  { key: "pf", label: "PF", title: "Personal fouls", value: (l) => l.pf },
  { key: "pm", label: "+/-", title: "Plus/minus", value: (l) => signed(l.plusMinus) },
];

/** Averages read better as decimals than "1.5-3.2" pairs. */
export const AVG_COLUMNS: Column[] = [
  { key: "min", label: "MIN", title: "Minutes per game", value: (l) => fmtMin(l.secondsPlayed) },
  { key: "pts", label: "PTS", title: "Points per game", value: (l) => l.pts },
  { key: "fgm", label: "FGM", title: "Field goals made", value: (l) => l.fgm },
  { key: "fga", label: "FGA", title: "Field goals attempted", value: (l) => l.fga },
  { key: "tpm", label: "3PM", title: "3-pointers made", value: (l) => l.tpm },
  { key: "ftm", label: "FTM", title: "Free throws made", value: (l) => l.ftm },
  { key: "reb", label: "REB", title: "Rebounds", value: (l) => l.reb },
  { key: "ast", label: "AST", title: "Assists", value: (l) => l.ast },
  { key: "stl", label: "STL", title: "Steals", value: (l) => l.stl },
  { key: "blk", label: "BLK", title: "Blocks", value: (l) => l.blk },
  { key: "tov", label: "TO", title: "Turnovers", value: (l) => l.tov },
  { key: "pf", label: "PF", title: "Personal fouls", value: (l) => l.pf },
  { key: "pm", label: "+/-", title: "Plus/minus", value: (l) => signed(l.plusMinus) },
];

export function boxScoreRows(
  players: readonly Player[],
  lines: Record<string, PlayerLine>,
  columns: Column[] = BOX_COLUMNS,
  extra: { label: string; value: (id: string) => Cell }[] = [],
): Cell[][] {
  return [
    ["#", "Player", ...extra.map((e) => e.label), ...columns.map((c) => c.label)],
    ...players
      .filter((p) => lines[p.id])
      .map((p) => [
        p.jersey ?? "",
        p.name,
        ...extra.map((e) => e.value(p.id)),
        ...columns.map((c) => c.value(lines[p.id] ?? emptyLine())),
      ]),
  ];
}

export function playByPlayRows(
  events: readonly BasketballEvent[],
  players: readonly Player[],
  config: BasketballConfig,
  opponentName: string,
): Cell[][] {
  const byId = new Map(players.map((p) => [p.id, p]));
  const nameOf = (id: string) => byId.get(id)?.name ?? "Unknown";
  let us = 0;
  let opp = 0;
  const rows: Cell[][] = [["Period", "Clock", "Team", "Player", "Play", "Score"]];
  for (const e of events) {
    if (e.type === "shot" && e.payload.made) {
      if (e.side === "us") us += e.payload.points;
      else opp += e.payload.points;
    }
    const structural = e.type === "period_start" || e.type === "period_end";
    rows.push([
      periodLabel(config, e.period),
      formatClock(e.clockMs),
      structural ? "" : e.side === "us" ? "Us" : opponentName,
      e.playerId ? nameOf(e.playerId) : "",
      describeEvent(e, config, nameOf),
      `${us}-${opp}`,
    ]);
  }
  return rows;
}
