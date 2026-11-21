import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_ARCHETYPES, type Archetype, type ArchetypeMetric } from "@/lib/sports/basketball/archetypes";

export interface AnalysisSettings {
  /** The team's own benchmark targets (metric key → target); defaults fill the rest. */
  benchmarks: Record<string, number>;
  /** The team's archetypes, or the built-in starter set if it hasn't saved any yet. */
  archetypes: Archetype[];
  /** True once the team's archetypes are stored in the database (needed to assign players). */
  archetypesSaved: boolean;
  /** Player id → assigned archetype id. */
  assignments: Record<string, string>;
  /** True when migration 0006 hasn't been run yet (tables missing). */
  needsMigration: boolean;
}

interface ArchetypeRow {
  id: string;
  name: string;
  description: string;
  metrics: ArchetypeMetric[];
}

/** Postgres "relation does not exist" (migration not run) or PostgREST "table not in schema cache". */
const isMissingTable = (e: { code?: string } | null) => e?.code === "42P01" || e?.code === "PGRST205";

export async function loadAnalysisSettings(supabase: SupabaseClient, teamId: string): Promise<AnalysisSettings> {
  const [b, a, p] = await Promise.all([
    supabase.from("benchmarks").select("metric_key, target").eq("team_id", teamId),
    supabase.from("archetypes").select("id, name, description, metrics").eq("team_id", teamId).order("sort_order"),
    supabase.from("player_archetypes").select("player_id, archetype_id").eq("team_id", teamId),
  ]);
  if (isMissingTable(b.error) || isMissingTable(a.error) || isMissingTable(p.error)) {
    return { benchmarks: {}, archetypes: DEFAULT_ARCHETYPES, archetypesSaved: false, assignments: {}, needsMigration: true };
  }
  for (const r of [b, a, p]) if (r.error) throw r.error;

  const rows = (a.data ?? []) as ArchetypeRow[];
  return {
    benchmarks: Object.fromEntries((b.data ?? []).map((r) => [r.metric_key as string, Number(r.target)])),
    archetypes: rows.length
      ? rows.map((r) => ({ id: r.id, name: r.name, description: r.description, metrics: r.metrics ?? [] }))
      : DEFAULT_ARCHETYPES,
    archetypesSaved: rows.length > 0,
    assignments: Object.fromEntries((p.data ?? []).map((r) => [r.player_id as string, r.archetype_id as string])),
    needsMigration: false,
  };
}

/** Copies the built-in starter archetypes into the team's own (editable) set, once. */
export async function saveDefaultArchetypes(supabase: SupabaseClient, teamId: string): Promise<void> {
  const { count, error } = await supabase
    .from("archetypes")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId);
  if (error) throw error;
  if (count) return;
  const { error: insertError } = await supabase.from("archetypes").insert(
    DEFAULT_ARCHETYPES.map((a, i) => ({
      team_id: teamId,
      name: a.name,
      description: a.description,
      metrics: a.metrics,
      sort_order: i,
    })),
  );
  if (insertError) throw insertError;
}
