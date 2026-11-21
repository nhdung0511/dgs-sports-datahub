"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canEdit, getMyTeam } from "@/lib/db/teams";

function back(param: string, value: string): never {
  // Box scores, season totals and the home page all read from games.
  revalidatePath("/", "layout");
  redirect(`/games?${param}=${encodeURIComponent(value)}`);
}

/**
 * Deletes a game and (via ON DELETE CASCADE) every play recorded in it.
 * Team admins can delete any team game; scorekeepers only the games they keep.
 */
export async function deleteGame(form: FormData) {
  const id = String(form.get("id") ?? "");
  const { supabase, user } = await requireUser("/games");
  const team = await getMyTeam(supabase, user.id);
  if (!team || !canEdit(team.role)) back("error", "Only admins and scorekeepers can delete games.");

  const { data: game } = await supabase
    .from("games")
    .select("id, scorekeeper_id")
    .eq("id", id)
    .eq("team_id", team.id)
    .maybeSingle();
  if (!game) back("error", "That game no longer exists.");
  if (team.role !== "admin" && game.scorekeeper_id !== user.id) {
    back("error", "Only a team admin or this game's scorekeeper can delete it.");
  }

  const { data: deleted, error } = await supabase.from("games").delete().eq("id", id).select("id");
  if (error) back("error", error.message);
  if (!deleted?.length) back("error", "The game couldn't be deleted. Check that you're still on the team.");
  back("deleted", "1");
}
