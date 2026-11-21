/** Sport-agnostic core shared by every sport module. Mirrors supabase/migrations/0001_init.sql. */

export type Side = "us" | "opp";
export type GameStatus = "scheduled" | "live" | "final";

export interface Team {
  id: string;
  name: string;
  sport: string;
}

export interface Player {
  id: string;
  teamId: string;
  name: string;
  jersey: string | null;
  active: boolean;
}

export interface Game<TConfig = unknown> {
  id: string;
  teamId: string;
  sport: string;
  opponentName: string;
  startsAt: string | null;
  status: GameStatus;
  config: TConfig;
  scorekeeperId: string | null;
}

/** One entry in a game's event log. Stats are always derived from the log, never stored. */
export interface GameEvent<TType extends string = string, TPayload = Record<string, unknown>> {
  id: string; // generated on device → idempotent offline sync
  gameId: string;
  seq: number;
  period: number;
  clockMs: number; // game clock remaining in the period
  side: Side;
  type: TType;
  playerId: string | null;
  payload: TPayload;
  deleted: boolean;
}

/** Live (non-deleted) events in log order. */
export function liveEvents<E extends GameEvent>(events: readonly E[]): E[] {
  return events.filter((e) => !e.deleted).sort((a, b) => a.seq - b.seq);
}
