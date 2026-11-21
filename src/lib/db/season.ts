import type { SupabaseClient } from "@supabase/supabase-js";
import type { Player, Team } from "@/lib/sports/types";
import { getClubTeam } from "./teams";
import { fetchRoster, listGames, loadGamesWithBox, type GameWithBox } from "./games";

export interface SeasonData {
  team: Team;
  players: Player[];
  games: GameWithBox[]; // final games, newest first
}

/** Everything season stats and the dashboard need, in three queries. */
export async function loadSeason(supabase: SupabaseClient, userId?: string | null): Promise<SeasonData | null> {
  const team = await getClubTeam(supabase, userId);
  if (!team) return null;
  const [players, finals] = await Promise.all([
    fetchRoster(supabase, team.id, { includeInactive: true }),
    listGames(supabase, team.id, { status: "final" }),
  ]);
  return { team, players, games: await loadGamesWithBox(supabase, finals) };
}
