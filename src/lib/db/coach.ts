import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalysisGame } from "@/lib/sports/basketball/advanced";
import { loadSeason } from "./season";

/** Postgres "relation does not exist" (migration not run) or PostgREST "table not in schema cache". */
const isMissingTable = (e: { code?: string } | null) => e?.code === "42P01" || e?.code === "PGRST205";

export interface CoachSettings {
  /** The team's changes to the default thresholds (merged with mergeThresholds()). */
  overrides: Record<string, number>;
  /** 0007_coach_role.sql hasn't been run yet. */
  needsMigration: boolean;
}

export async function loadCoachSettings(supabase: SupabaseClient, teamId: string): Promise<CoachSettings> {
  const { data, error } = await supabase.from("coach_thresholds").select("values").eq("team_id", teamId).maybeSingle();
  if (isMissingTable(error)) return { overrides: {}, needsMigration: true };
  if (error) throw error;
  return { overrides: (data?.values as Record<string, number> | undefined) ?? {}, needsMigration: false };
}

export async function saveCoachThresholds(supabase: SupabaseClient, teamId: string, values: Record<string, number>) {
  const { error } = await supabase
    .from("coach_thresholds")
    .upsert({ team_id: teamId, values, updated_at: new Date().toISOString() }, { onConflict: "team_id" });
  if (error) throw error;
}

/** Previous final games (newest first) as the baseline for "today vs normal", excluding `gameId`. */
export async function loadBaselineGames(supabase: SupabaseClient, userId: string, gameId: string): Promise<AnalysisGame[]> {
  const season = await loadSeason(supabase, userId);
  return (season?.games ?? [])
    .filter(({ game }) => game.id !== gameId)
    .map(({ game, box }) => ({ box, opponentStats: Boolean(game.config.opponentStats) }));
}
