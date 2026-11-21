import Link from "next/link";
import { Notice, PageTitle, SiteShell } from "@/components/site-shell";
import { btnGhost, btnPrimary, card, input, label } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { loadAnalysisSettings, saveDefaultArchetypes } from "@/lib/db/analysis-settings";
import { fetchRoster } from "@/lib/db/games";
import { getMyTeam } from "@/lib/db/teams";
import { DEFAULT_BENCHMARKS } from "@/lib/sports/basketball/archetypes";
import { GROUP_LABELS, METRICS, type MetricGroup } from "@/lib/sports/basketball/metrics";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { addArchetype, deleteArchetype, saveArchetype, saveAssignments, saveBenchmarks } from "./actions";

export const metadata = { title: "Analysis settings · DGS Sports Datahub" };

const SLOTS = 8; // key-stat rows per archetype

export default async function AnalysisSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; error?: string }>;
}) {
  if (!isSupabaseConfigured) return <SiteShell>{null}</SiteShell>;
  const { msg, error } = await searchParams;
  const { supabase, user } = await requireUser("/analysis/settings");
  const team = await getMyTeam(supabase, user.id);
  if (!team) {
    return (
      <SiteShell>
        <PageTitle title="Analysis settings" />
        <p className="text-muted">For team members only.</p>
      </SiteShell>
    );
  }
  const isAdmin = team.role === "admin";

  let settings = await loadAnalysisSettings(supabase, team.id);
  // First visit by an admin: copy the starter archetypes into the team's own editable set.
  if (isAdmin && !settings.needsMigration && !settings.archetypesSaved) {
    await saveDefaultArchetypes(supabase, team.id);
    settings = await loadAnalysisSettings(supabase, team.id);
  }
  const players = await fetchRoster(supabase, team.id);
  const groups = Object.keys(GROUP_LABELS) as MetricGroup[];
  const ro = !isAdmin || settings.needsMigration; // read-only

  const metricOptions = groups.map((g) => (
    <optgroup key={g} label={GROUP_LABELS[g]}>
      {METRICS.filter((m) => m.group === g).map((m) => (
        <option key={m.key} value={m.key}>
          {m.label}
        </option>
      ))}
    </optgroup>
  ));

  return (
    <SiteShell wide>
      <PageTitle
        title="Analysis settings"
        sub={isAdmin ? "Archetypes, goals and benchmarks used on the Analysis tab" : "View only: team admins can change these"}
        action={
          <Link href="/analysis" className={btnGhost}>
            ← Back to Analysis
          </Link>
        }
      />
      <Notice msg={msg} />
      <Notice msg={error} tone="error" />
      {settings.needsMigration && (
        <p className="mb-6 rounded-xl bg-warn-soft px-4 py-3 text-sm ring-1 ring-warn/50">
          Run <code className="font-bold">supabase/migrations/0006_benchmarks_archetypes.sql</code> in the Supabase SQL Editor to
          save your own settings. Until then the built-in defaults are used.
        </p>
      )}

      {/* Player archetypes */}
      <section className={`${card} p-5 sm:p-6`}>
        <h2 className="text-xl font-black">Player archetypes</h2>
        <p className="mt-1 text-sm text-muted">
          The role each player is judged on. Leave as &quot;Auto-detect&quot; to let their stats decide; the Analysis tab can switch
          between assigned and auto-detected.
        </p>
        <form action={saveAssignments} className="mt-4">
          <ul className="grid gap-3 sm:grid-cols-2">
            {players.map((p) => (
              <li key={p.id} className="flex items-center gap-3">
                <span className="w-40 shrink-0 truncate font-medium">
                  #{p.jersey ?? "–"} {p.name}
                </span>
                <select
                  name={`p_${p.id}`}
                  defaultValue={settings.assignments[p.id] ?? ""}
                  disabled={ro || !settings.archetypesSaved}
                  aria-label={`Archetype for ${p.name}`}
                  className={input}
                >
                  <option value="">Auto-detect</option>
                  {settings.archetypes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
          {!ro && <button className={`${btnPrimary} mt-4`}>Save player archetypes</button>}
        </form>
      </section>

      {/* Archetypes */}
      <section className={`${card} mt-6 p-5 sm:p-6`}>
        <h2 className="text-xl font-black">Archetypes</h2>
        <p className="mt-1 text-sm text-muted">
          Each archetype is a few key stats with a goal for each. Goals for counting stats (PTS, REB, ...) are per 32 minutes.
          The archetype rating is a player&apos;s average team percentile on these stats.
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {settings.archetypes.map((a) => (
            <div key={a.id} className="rounded-xl bg-card-2 p-4">
              <form action={saveArchetype} className="space-y-3">
                <input type="hidden" name="id" value={a.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={label} htmlFor={`n-${a.id}`}>
                      Name
                    </label>
                    <input id={`n-${a.id}`} name="name" defaultValue={a.name} required disabled={ro} className={input} />
                  </div>
                  <div>
                    <label className={label} htmlFor={`d-${a.id}`}>
                      Description
                    </label>
                    <input id={`d-${a.id}`} name="description" defaultValue={a.description} disabled={ro} className={input} />
                  </div>
                </div>
                <div>
                  <span className={label}>Key stats and goals</span>
                  <div className="space-y-2">
                    {Array.from({ length: ro ? a.metrics.length : SLOTS }, (_, i) => {
                      const m = a.metrics[i];
                      return (
                        <div key={i} className="grid grid-cols-[1fr_6rem] gap-2">
                          <select name={`metric_${i}`} defaultValue={m?.key ?? ""} disabled={ro} aria-label={`Key stat ${i + 1}`} className={input}>
                            <option value="">—</option>
                            {metricOptions}
                          </select>
                          <input
                            name={`goal_${i}`}
                            type="number"
                            step="any"
                            defaultValue={m?.goal ?? ""}
                            disabled={ro}
                            aria-label={`Goal for key stat ${i + 1}`}
                            placeholder="goal"
                            className={input}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
                {!ro && <button className={btnPrimary}>Save {a.name}</button>}
              </form>
              {!ro && (
                <form action={deleteArchetype} className="mt-2 text-right">
                  <input type="hidden" name="id" value={a.id} />
                  <button className="text-sm font-medium text-muted underline hover:text-opp">Delete {a.name}</button>
                </form>
              )}
            </div>
          ))}
        </div>
        {!ro && (
          <form action={addArchetype} className="mt-4 grid gap-3 rounded-xl border border-dashed border-line p-4 sm:grid-cols-[1fr_2fr_auto]">
            <div>
              <label className={label} htmlFor="new-name">
                New archetype
              </label>
              <input id="new-name" name="name" required placeholder="e.g. 3-and-D wing" className={input} />
            </div>
            <div>
              <label className={label} htmlFor="new-desc">
                Description
              </label>
              <input id="new-desc" name="description" placeholder="What this role does" className={input} />
            </div>
            <button className={`${btnPrimary} self-end`}>+ Add</button>
          </form>
        )}
      </section>

      {/* Benchmarks */}
      <section className={`${card} mt-6 p-5 sm:p-6`}>
        <h2 className="text-xl font-black">Benchmarks</h2>
        <p className="mt-1 text-sm text-muted">
          Target values for the radar&apos;s Benchmarks view: hitting a target puts a player on the &quot;goal&quot; ring. Counting stats
          are per 32 minutes. Leave a box empty to use the default.
        </p>
        <form action={saveBenchmarks} className="mt-4">
          <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {METRICS.map((m) => (
              <div key={m.key} className="grid grid-cols-[1fr_6rem] items-center gap-2">
                <label htmlFor={`b-${m.key}`} className="text-sm" title={m.help}>
                  <b>{m.label}</b>
                  <span className="text-muted">
                    {" "}
                    · default {DEFAULT_BENCHMARKS[m.key] ?? "–"}
                    {m.lowerIsBetter ? " (lower is better)" : ""}
                  </span>
                </label>
                <input
                  id={`b-${m.key}`}
                  name={`b_${m.key}`}
                  type="number"
                  step="any"
                  defaultValue={settings.benchmarks[m.key] ?? ""}
                  placeholder={String(DEFAULT_BENCHMARKS[m.key] ?? "")}
                  disabled={ro}
                  className={input}
                />
              </div>
            ))}
          </div>
          {!ro && <button className={`${btnPrimary} mt-4`}>Save benchmarks</button>}
        </form>
      </section>
    </SiteShell>
  );
}
