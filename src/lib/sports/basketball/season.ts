import type { Game } from "../types";
import type { BasketballConfig } from "./events";
import { addTeamLine, emptyLine, emptyTeamLine, type BoxScore, type LineupLine, type PlayerLine } from "./stats";

export interface SeasonLine extends PlayerLine {
  gp: number;
}

const NUMERIC_KEYS = Object.keys(emptyLine()) as (keyof PlayerLine)[];

/** Adds up every player's box-score lines across games. */
export function seasonTotals(boxes: readonly BoxScore[]): Record<string, SeasonLine> {
  const out: Record<string, SeasonLine> = {};
  for (const box of boxes) {
    for (const [id, l] of Object.entries(box.players)) {
      const acc = (out[id] ??= { ...emptyLine(), gp: 0 });
      acc.gp++;
      for (const k of NUMERIC_KEYS) acc[k] += l[k];
    }
  }
  return out;
}

/** Per-game averages (one decimal). */
export function perGame(l: SeasonLine): PlayerLine {
  const avg = { ...emptyLine() };
  if (l.gp === 0) return avg;
  for (const k of NUMERIC_KEYS) avg[k] = Math.round((l[k] / l.gp) * 10) / 10;
  return avg;
}

/** Percentage 0–100 with one decimal, or null with no attempts. */
export function pct(made: number, att: number): number | null {
  return att > 0 ? Math.round((made / att) * 1000) / 10 : null;
}

export function teamLine(box: BoxScore): PlayerLine {
  const t = emptyLine();
  for (const l of Object.values(box.players)) for (const k of NUMERIC_KEYS) t[k] += l[k];
  return t;
}

export interface TeamGameRow {
  gameId: string;
  opponent: string;
  date: string | null;
  us: number;
  opp: number;
  result: "W" | "L" | "T";
  fgPct: number | null;
  tpPct: number | null;
  ftPct: number | null;
}

export function teamGameRows(
  games: readonly { game: Game<BasketballConfig>; box: BoxScore }[],
): TeamGameRow[] {
  return games.map(({ game, box }) => {
    const t = teamLine(box);
    const { us, opp } = box.score;
    return {
      gameId: game.id,
      opponent: game.opponentName,
      date: game.startsAt,
      us,
      opp,
      result: us > opp ? "W" : us < opp ? "L" : "T",
      fgPct: pct(t.fgm, t.fga),
      tpPct: pct(t.tpm, t.tpa),
      ftPct: pct(t.ftm, t.fta),
    };
  });
}

export function winLoss(rows: readonly TeamGameRow[]) {
  return {
    w: rows.filter((r) => r.result === "W").length,
    l: rows.filter((r) => r.result === "L").length,
    t: rows.filter((r) => r.result === "T").length,
  };
}

/** Average points scored and allowed in each regulation period. */
export function periodAverages(boxes: readonly BoxScore[], periodCount: number) {
  return Array.from({ length: periodCount }, (_, i) => {
    const played = boxes.filter(
      (b) => b.scoreByPeriod.us.length > i || b.scoreByPeriod.opp.length > i,
    );
    const avg = (side: "us" | "opp") =>
      played.length
        ? Math.round((played.reduce((s, b) => s + (b.scoreByPeriod[side][i] ?? 0), 0) / played.length) * 10) / 10
        : 0;
    return { period: i + 1, us: avg("us"), opp: avg("opp"), games: played.length };
  });
}

export interface SeasonLineup extends LineupLine {
  plusMinus: number;
}

/** Five-player units across the season, best plus/minus first. */
export function seasonLineups(boxes: readonly BoxScore[], minSeconds = 120): SeasonLineup[] {
  const acc = new Map<string, LineupLine>();
  for (const b of boxes) {
    for (const [key, l] of Object.entries(b.lineups)) {
      if (l.players.length !== 5) continue;
      const a = acc.get(key) ?? {
        players: l.players,
        seconds: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        team: { us: emptyTeamLine(), opp: emptyTeamLine() },
      };
      a.seconds += l.seconds;
      a.pointsFor += l.pointsFor;
      a.pointsAgainst += l.pointsAgainst;
      addTeamLine(a.team.us, l.team.us);
      addTeamLine(a.team.opp, l.team.opp);
      acc.set(key, a);
    }
  }
  return [...acc.values()]
    .filter((l) => l.seconds >= minSeconds)
    .map((l) => ({ ...l, plusMinus: l.pointsFor - l.pointsAgainst }))
    .sort((a, b) => b.plusMinus - a.plusMinus || b.seconds - a.seconds);
}
