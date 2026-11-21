import type { SupabaseClient } from "@supabase/supabase-js";
import type { GameEvent, Side } from "@/lib/sports/types";

/** Row shape of public.game_events. */
export interface GameEventRow {
  id: string;
  game_id: string;
  seq: number;
  period: number;
  clock_ms: number;
  side: Side;
  type: string;
  player_id: string | null;
  payload: Record<string, unknown>;
  deleted: boolean;
}

export function toRow(e: GameEvent): GameEventRow {
  return {
    id: e.id,
    game_id: e.gameId,
    seq: e.seq,
    period: e.period,
    clock_ms: e.clockMs,
    side: e.side,
    type: e.type,
    player_id: e.playerId,
    payload: e.payload as Record<string, unknown>,
    deleted: e.deleted,
  };
}

export function fromRow(r: GameEventRow): GameEvent {
  return {
    id: r.id,
    gameId: r.game_id,
    seq: r.seq,
    period: r.period,
    clockMs: r.clock_ms,
    side: r.side,
    type: r.type,
    playerId: r.player_id,
    payload: r.payload,
    deleted: r.deleted,
  };
}

export async function fetchGameEvents(supabase: SupabaseClient, gameId: string) {
  const { data, error } = await supabase
    .from("game_events")
    .select("*")
    .eq("game_id", gameId)
    .order("seq");
  if (error) throw error;
  return (data as GameEventRow[]).map(fromRow);
}

/** Idempotent write: safe to retry the same events after a dropped connection. */
export async function upsertGameEvents(supabase: SupabaseClient, events: GameEvent[]) {
  if (events.length === 0) return;
  const { error } = await supabase.from("game_events").upsert(events.map(toRow), { onConflict: "id" });
  if (error) throw error;
}
