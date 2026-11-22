"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { saveCoachThresholds } from "@/lib/db/coach";
import { getMyTeam, isCoach } from "@/lib/db/teams";
import { THRESHOLD_LABELS, type CoachThresholds } from "@/lib/sports/basketball/coach-alerts";
import { metricByKey, METRICS } from "@/lib/sports/basketball/metrics";

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function done(msg: string, error = false): never {
  revalidatePath("/analysis", "layout");
  redirect(`/analysis/settings?${error ? "error" : "msg"}=${encodeURIComponent(msg)}`);
}

/** Only team admins change benchmarks and archetypes (the database enforces this too). */
async function admin() {
  const { supabase, user } = await requireUser("/analysis/settings");
  const team = await getMyTeam(supabase, user.id);
  if (!team || team.role !== "admin") done("Only team admins can change these settings.", true);
  return { supabase, team };
}

/** A finite number from a form field, or null if blank/invalid. */
function num(f: FormData, k: string): number | null {
  const s = text(f, k);
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function saveAssignments(form: FormData) {
  const { supabase, team } = await admin();
  const upserts: { player_id: string; team_id: string; archetype_id: string }[] = [];
  const clears: string[] = [];
  for (const [k, v] of form.entries()) {
    if (!k.startsWith("p_")) continue;
    const playerId = k.slice(2);
    if (String(v)) upserts.push({ player_id: playerId, team_id: team.id, archetype_id: String(v) });
    else clears.push(playerId);
  }
  if (clears.length) {
    const { error } = await supabase.from("player_archetypes").delete().eq("team_id", team.id).in("player_id", clears);
    if (error) done(error.message, true);
  }
  if (upserts.length) {
    const { error } = await supabase.from("player_archetypes").upsert(upserts);
    if (error) done(error.message, true);
  }
  done("Player archetypes saved.");
}

export async function saveArchetype(form: FormData) {
  const { supabase, team } = await admin();
  const id = text(form, "id");
  const name = text(form, "name");
  if (!name) done("Give the archetype a name.", true);
  const metrics: { key: string; goal: number }[] = [];
  for (let i = 0; i < 10; i++) {
    const key = text(form, `metric_${i}`);
    if (!key) continue;
    const goal = num(form, `goal_${i}`);
    if (!metricByKey(key)) done(`Unknown stat "${key}".`, true);
    if (goal === null) done(`Set a goal for ${metricByKey(key)!.label} in ${name}.`, true);
    if (!metrics.some((m) => m.key === key)) metrics.push({ key, goal });
  }
  if (metrics.length < 2) done(`${name} needs at least 2 key stats.`, true);
  const { error } = await supabase
    .from("archetypes")
    .update({ name, description: text(form, "description"), metrics })
    .eq("id", id)
    .eq("team_id", team.id);
  if (error) done(error.message, true);
  done(`${name} saved.`);
}

export async function addArchetype(form: FormData) {
  const { supabase, team } = await admin();
  const name = text(form, "name");
  if (!name) done("Give the new archetype a name.", true);
  const { count } = await supabase.from("archetypes").select("id", { count: "exact", head: true }).eq("team_id", team.id);
  const { error } = await supabase.from("archetypes").insert({
    team_id: team.id,
    name,
    description: text(form, "description"),
    // Start from two general stats so it can be rated straight away; edit below.
    metrics: [
      { key: "gameScorePer32", goal: 10 },
      { key: "tsPct", goal: 52 },
    ],
    sort_order: (count ?? 0) + 1,
  });
  if (error) done(error.message, true);
  done(`${name} added. Pick its key stats and goals below.`);
}

export async function deleteArchetype(form: FormData) {
  const { supabase, team } = await admin();
  const { error } = await supabase.from("archetypes").delete().eq("id", text(form, "id")).eq("team_id", team.id);
  if (error) done(error.message, true);
  done("Archetype deleted. Players who had it are now unassigned.");
}

export async function saveBenchmarks(form: FormData) {
  const { supabase, team } = await admin();
  const upserts: { team_id: string; metric_key: string; target: number }[] = [];
  const clears: string[] = [];
  for (const m of METRICS) {
    const v = num(form, `b_${m.key}`);
    if (v === null) clears.push(m.key);
    else upserts.push({ team_id: team.id, metric_key: m.key, target: v });
  }
  if (clears.length) {
    const { error } = await supabase.from("benchmarks").delete().eq("team_id", team.id).in("metric_key", clears);
    if (error) done(error.message, true);
  }
  if (upserts.length) {
    const { error } = await supabase.from("benchmarks").upsert(upserts);
    if (error) done(error.message, true);
  }
  done("Benchmarks saved.");
}

/** Coach-view alert thresholds: coaches and admins (blank = use the format's default). */
export async function saveCoachSettings(form: FormData) {
  const { supabase, user } = await requireUser("/analysis/settings");
  const team = await getMyTeam(supabase, user.id);
  if (!team || !isCoach(team.role)) done("Only coaches and admins can change alert settings.", true);
  const values: Record<string, number> = {};
  for (const k of Object.keys(THRESHOLD_LABELS) as (keyof CoachThresholds)[]) {
    const v = num(form, `t_${k}`);
    if (v !== null && v >= 0) values[k] = v;
  }
  try {
    await saveCoachThresholds(supabase, team.id, values);
  } catch (e) {
    done(e instanceof Error ? e.message : "Couldn't save alert settings.", true);
  }
  done("Coach alert settings saved.");
}
