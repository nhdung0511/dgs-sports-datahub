import type { GameEvent } from "../types";

export interface BasketballConfig {
  periodCount: number; // 4 quarters or 2 halves
  periodLengthSec: number;
  overtimeLengthSec: number;
  /**
   * True when the scorer recorded opponent misses, rebounds and turnovers (games created after
   * that was added). Possession-based stats (pace, ratings, rebound %) only use these games.
   */
  opponentStats?: boolean;
}

export const FIBA_CONFIG: BasketballConfig = {
  periodCount: 4,
  periodLengthSec: 600,
  overtimeLengthSec: 300,
};

export function periodLengthMs(config: BasketballConfig, period: number): number {
  const sec = period <= config.periodCount ? config.periodLengthSec : config.overtimeLengthSec;
  return sec * 1000;
}

/** Payload for each basketball event type. */
export interface BasketballPayloads {
  /** lineup = our five on court when the period starts. */
  period_start: { lineup: string[] };
  period_end: Record<string, never>;
  shot: { points: 1 | 2 | 3; made: boolean };
  rebound: { offensive: boolean };
  assist: Record<string, never>;
  steal: Record<string, never>;
  block: Record<string, never>;
  turnover: Record<string, never>;
  foul: Record<string, never>;
  timeout: Record<string, never>;
  /** Our substitution: playerIn replaces playerOut. */
  sub: { playerIn: string; playerOut: string };
}

export type BasketballEventType = keyof BasketballPayloads;

export type BasketballEvent = {
  [K in BasketballEventType]: GameEvent<K, BasketballPayloads[K]>;
}[BasketballEventType];
