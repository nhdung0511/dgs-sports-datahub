"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getMyTeam } from "@/lib/db/teams";
import type { BasketballConfig } from "@/lib/sports/basketball/events";

export async function createGame(form: FormData) {
  const { supabase, user } = await requireUser("/games/new");
  const team = await getMyTeam(supabase, user.id);
  if (!team) redirect("/team");

  const opponent = String(form.get("opponent") ?? "").trim();
  const int = (k: string, min: number, max: number) => {
    const n = Math.round(Number(form.get(k)));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
  };
  const config: BasketballConfig = {
    periodCount: int("periodCount", 1, 8),
    periodLengthSec: int("periodMinutes", 1, 30) * 60,
    overtimeLengthSec: int("overtimeMinutes", 1, 15) * 60,
  };
  const startsAt = String(form.get("startsAtIso") ?? "") || new Date().toISOString();

  if (!opponent) redirect("/games/new?error=" + encodeURIComponent("Enter the opponent's name."));

  const { data, error } = await supabase
    .from("games")
    .insert({
      team_id: team.id,
      sport: "basketball",
      opponent_name: opponent,
      starts_at: startsAt,
      config,
      scorekeeper_id: user.id,
    })
    .select("id")
    .single();
  if (error) redirect("/games/new?error=" + encodeURIComponent(error.message));
  redirect(`/games/${data.id}/score`);
}
