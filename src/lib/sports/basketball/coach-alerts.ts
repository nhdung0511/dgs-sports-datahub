/**
 * Rule-based alerts for the coach view. Each rule is plain, explainable maths over CoachState;
 * no AI. Thresholds start from format-aware defaults and teams can override them.
 */
import type { Baseline, CoachState } from "./coach";
import type { BasketballConfig } from "./events";

export interface CoachThresholds {
  /** Personal fouls to foul out. */
  foulOut: number;
  /** Team fouls in a period after which every foul gives free throws. */
  penaltyAfter: number;
  /** Foul trouble when fouls ≥ (quarter-equivalent of the period) + this. */
  foulTroubleOffset: number;
  /** Opponent run (unanswered points) that triggers an alert. */
  runPoints: number;
  /** Seconds without us scoring. */
  droughtSec: number;
  /** Minutes in one stint before a rest alert. */
  stintMin: number;
  /** TS% points below the player's baseline to count as cold. */
  coldGap: number;
  /** Shot attempts (FGA + FTA) before hot/cold is judged. */
  minShots: number;
  /** Current lineup at this many points down (or worse) this game. */
  lineupMinus: number;
}

export const THRESHOLD_LABELS: Record<keyof CoachThresholds, { label: string; unit: string }> = {
  foulOut: { label: "Foul-out limit", unit: "fouls" },
  penaltyAfter: { label: "Team fouls before penalty", unit: "fouls" },
  foulTroubleOffset: { label: "Foul trouble: fouls above quarter number", unit: "fouls" },
  runPoints: { label: "Opponent run alert", unit: "points" },
  droughtSec: { label: "Scoring drought alert", unit: "seconds" },
  stintMin: { label: "Long stint alert", unit: "minutes" },
  coldGap: { label: "Cold shooting: TS% below normal", unit: "points" },
  minShots: { label: "Shots before hot/cold", unit: "attempts" },
  lineupMinus: { label: "Lineup struggling at", unit: "points down" },
};

/** Defaults scale with the game format (NBA preset: 6 fouls; halves: 6 team fouls before penalty). */
export function defaultThresholds(config: BasketballConfig): CoachThresholds {
  const nba = config.periodCount === 4 && config.periodLengthSec >= 720;
  const halves = config.periodCount === 2;
  const periodMin = config.periodLengthSec / 60;
  return {
    foulOut: nba ? 6 : 5,
    penaltyAfter: halves ? 6 : 4,
    foulTroubleOffset: 1,
    runPoints: 8,
    droughtSec: Math.round(periodMin * 0.4 * 60),
    stintMin: Math.max(4, Math.round(periodMin * (halves ? 0.4 : 0.75))),
    coldGap: 15,
    minShots: 5,
    lineupMinus: 6,
  };
}

/** Team overrides on top of the defaults; unknown or non-numeric keys are ignored. */
export function mergeThresholds(config: BasketballConfig, overrides: unknown): CoachThresholds {
  const out = defaultThresholds(config);
  if (overrides && typeof overrides === "object") {
    for (const k of Object.keys(out) as (keyof CoachThresholds)[]) {
      const v = (overrides as Record<string, unknown>)[k];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[k] = v;
    }
  }
  return out;
}

export type AlertLevel = "high" | "warn" | "info";

export interface CoachAlert {
  /** Stable while the condition holds, so the history can show when it first fired. */
  id: string;
  level: AlertLevel;
  text: string;
  playerId?: string;
}

const LEVEL_ORDER: Record<AlertLevel, number> = { high: 0, warn: 1, info: 2 };

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

export function coachAlerts(
  s: CoachState,
  config: BasketballConfig,
  t: CoachThresholds,
  baseline: Baseline | null,
  nameOf: (id: string) => string,
): CoachAlert[] {
  const out: CoachAlert[] = [];
  if (s.period === 0) return out;
  const onCourt = new Set(s.box.onCourt);

  // Fouls: trouble relative to how far into the game we are; one away from fouling out.
  const quarterEq = Math.min(4, Math.ceil((Math.min(s.period, config.periodCount) * 4) / config.periodCount));
  const troubleAt = Math.min(quarterEq + t.foulTroubleOffset, t.foulOut - 1);
  for (const [id, l] of Object.entries(s.box.players)) {
    if (l.pf >= t.foulOut) continue; // already out; nothing to decide
    if (l.pf === t.foulOut - 1) {
      out.push({ id: `foul-last:${id}`, level: "high", text: `${nameOf(id)} has ${l.pf} fouls: one more and they're out.`, playerId: id });
    } else if (l.pf >= troubleAt) {
      out.push({
        id: `foul-trouble:${id}`,
        level: onCourt.has(id) ? "warn" : "info",
        text: `${nameOf(id)} is in foul trouble: ${l.pf} fouls${onCourt.has(id) ? " and on the floor" : ""}.`,
        playerId: id,
      });
    }
  }

  // Team fouls and the penalty.
  if (s.inPeriod) {
    if (s.teamFouls.us >= t.penaltyAfter)
      out.push({ id: `penalty-opp:${s.period}`, level: "warn", text: `Opponent is in the bonus: we have ${s.teamFouls.us} team fouls this period.` });
    else if (s.teamFouls.us === t.penaltyAfter - 1)
      out.push({ id: `penalty-near:${s.period}`, level: "info", text: `${s.teamFouls.us} team fouls: our next foul gives free throws.` });
    if (s.teamFouls.opp >= t.penaltyAfter)
      out.push({ id: `penalty-us:${s.period}`, level: "info", text: `We're in the bonus: attack the rim, every foul is free throws.` });
  }

  // Momentum.
  const run = s.currentRun;
  if (run && run.side === "opp" && run.points >= t.runPoints)
    out.push({ id: `run:${run.startSec}`, level: "high", text: `Opponent on a ${run.points}-0 run. Consider a timeout.` });
  if (s.sinceScore.us !== null && s.sinceScore.us >= t.droughtSec)
    out.push({ id: `drought:${Math.round(s.nowSec - s.sinceScore.us)}`, level: "warn", text: `No points from us in ${mmss(s.sinceScore.us)}.` });

  // Fatigue: long stints for players on court.
  for (const [id, sec] of Object.entries(s.stintSec)) {
    if (sec >= t.stintMin * 60)
      out.push({ id: `stint:${id}`, level: "warn", text: `${nameOf(id)} has played ${mmss(sec)} straight. Rest them?`, playerId: id });
  }

  // Hot / cold vs the player's own normal (TS%).
  if (baseline) {
    for (const [id, l] of Object.entries(s.box.players)) {
      const attempts = l.fga + l.fta;
      const base = baseline.players[id]?.tsPct;
      if (attempts < t.minShots || base == null) continue;
      const ts = (100 * l.pts) / (2 * (l.fga + 0.44 * l.fta));
      if (ts <= base - t.coldGap)
        out.push({ id: `cold:${id}`, level: "warn", text: `${nameOf(id)} is cold: ${ts.toFixed(0)}% TS vs ${base.toFixed(0)}% normally.`, playerId: id });
      else if (ts >= base + t.coldGap && onCourt.has(id))
        out.push({ id: `hot:${id}`, level: "info", text: `${nameOf(id)} is hot: ${ts.toFixed(0)}% TS vs ${base.toFixed(0)}% normally. Keep feeding them.`, playerId: id });
    }
  }

  // Current lineup getting outscored.
  if (onCourt.size === 5) {
    const key = [...onCourt].sort().join("|");
    const l = s.box.lineups[key];
    const diff = l ? l.pointsFor - l.pointsAgainst : 0;
    if (diff <= -t.lineupMinus)
      out.push({ id: `lineup:${key}`, level: "warn", text: `This five is ${diff} together today (${(l!.seconds / 60).toFixed(1)} min).` });
  }

  return out.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}

export interface AlertHistoryItem extends CoachAlert {
  /** Event index (in live events) when the alert first appeared. */
  firstAt: number;
  period: number;
  clockMs: number;
  /** Still active at the end of the replayed range. */
  active: boolean;
}

/**
 * Replays the game play by play to find when each alert first fired. `stateAt(i)` returns the
 * game state after the first i live events.
 */
export function alertHistory(
  count: number,
  stateAt: (i: number) => CoachState,
  alertsFor: (s: CoachState) => CoachAlert[],
): AlertHistoryItem[] {
  const seen = new Map<string, AlertHistoryItem>();
  let active = new Set<string>();
  for (let i = 1; i <= count; i++) {
    const s = stateAt(i);
    const now = alertsFor(s);
    active = new Set(now.map((a) => a.id));
    for (const a of now) {
      if (!seen.has(a.id)) seen.set(a.id, { ...a, firstAt: i, period: s.period, clockMs: s.clockMs, active: true });
    }
  }
  for (const item of seen.values()) item.active = active.has(item.id);
  return [...seen.values()].sort((a, b) => b.firstAt - a.firstAt);
}
