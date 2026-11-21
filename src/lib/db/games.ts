import type { SupabaseClient } from "@supabase/supabase-js";
import { FIBA_CONFIG, type BasketballConfig, type BasketballEvent } from "@/lib/sports/basketball/events";
import { computeBoxScore, type BoxScore } from "@/lib/sports/basketball/stats";
import type { Game, GameStatus, Player } from "@/lib/sports/types";
import { fromRow, type GameEventRow } from "./events";

interface GameRow {
  id: string;
  team_id: string;
  sport: string;
  opponent_name: string;
  starts_at: string | null;
  status: GameStatus;
  config: Partial<BasketballConfig> | null;
  scorekeeper_id: string | null;
  created_at: string;
}

interface PlayerRow {
  id: string;
  team_id: string;
  name: string;
  jersey: string | null;
  active: boolean;
}

export type BasketballGame = Game<BasketballConfig>;

function toGame(r: GameRow): BasketballGame {
  return {
    id: r.id,
    teamId: r.team_id,
    sport: r.sport,
    opponentName: r.opponent_name,
    startsAt: r.starts_at ?? r.created_at,
    status: r.status,
    config: { ...FIBA_CONFIG, ...(r.config ?? {}) },
    scorekeeperId: r.scorekeeper_id,
  };
}

export async function fetchGame(supabase: SupabaseClient, id: string): Promise<BasketballGame | null> {
  // Non-UUID ids would make Postgres throw; treat them as "not found".
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await supabase.from("games").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toGame(data as GameRow) : null;
}

export async function listGames(
  supabase: SupabaseClient,
  teamId: string,
  opts: { status?: GameStatus; limit?: number } = {},
): Promise<BasketballGame[]> {
  let q = supabase
    .from("games")
    .select("*")
    .eq("team_id", teamId)
    .order("starts_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) throw error;
  return (data as GameRow[]).map(toGame);
}

export async function fetchRoster(
  supabase: SupabaseClient,
  teamId: string,
  opts: { includeInactive?: boolean } = {},
): Promise<Player[]> {
  let q = supabase.from("players").select("*").eq("team_id", teamId);
  if (!opts.includeInactive) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data as PlayerRow[])
    .map((r) => ({ id: r.id, teamId: r.team_id, name: r.name, jersey: r.jersey, active: r.active }))
    .sort((a, b) => jerseyNum(a.jersey) - jerseyNum(b.jersey) || a.name.localeCompare(b.name));
}

const jerseyNum = (j: string | null) => (j && /^\d+$/.test(j) ? Number(j) : 999);

/** Events for many games in one round trip, grouped by game. */
export async function fetchEventsForGames(
  supabase: SupabaseClient,
  gameIds: string[],
): Promise<Map<string, BasketballEvent[]>> {
  const byGame = new Map<string, BasketballEvent[]>(gameIds.map((id) => [id, []]));
  if (gameIds.length === 0) return byGame;
  const { data, error } = await supabase
    .from("game_events")
    .select("*")
    .in("game_id", gameIds)
    .eq("deleted", false)
    .order("seq");
  if (error) throw error;
  for (const r of data as GameEventRow[]) byGame.get(r.game_id)?.push(fromRow(r) as BasketballEvent);
  return byGame;
}

export interface GameWithBox {
  game: BasketballGame;
  box: BoxScore;
}

export async function loadGamesWithBox(
  supabase: SupabaseClient,
  games: BasketballGame[],
): Promise<GameWithBox[]> {
  const events = await fetchEventsForGames(
    supabase,
    games.map((g) => g.id),
  );
  return games.map((game) => ({ game, box: computeBoxScore(events.get(game.id) ?? []) }));
}
