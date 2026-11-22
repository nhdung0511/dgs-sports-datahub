import Link from "next/link";
import { notFound } from "next/navigation";
import { PageTitle, SiteShell } from "@/components/site-shell";
import { btnGhost, btnPrimary } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { loadBaselineGames, loadCoachSettings } from "@/lib/db/coach";
import { fetchGameEvents } from "@/lib/db/events";
import { fetchGame, fetchRoster } from "@/lib/db/games";
import { getMyTeam, isCoach } from "@/lib/db/teams";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { CoachLive } from "./coach-live";

export const metadata = { title: "Coach view · DGS Sports Datahub" };

/** Live coach view for one game: coaches and admins only (docs/coach-view-plan.md). */
export default async function CoachPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured) return <SiteShell>{null}</SiteShell>;
  const { id } = await params;
  const { supabase, user } = await requireUser(`/games/${id}/coach`);
  const [game, member] = await Promise.all([fetchGame(supabase, id), getMyTeam(supabase, user.id)]);
  if (!game) notFound();

  if (!member || member.id !== game.teamId || !isCoach(member.role)) {
    return (
      <SiteShell>
        <div className="mx-auto max-w-lg rounded-2xl border border-line bg-card p-6 text-center">
          <h1 className="text-xl font-black">For coaches only</h1>
          <p className="mt-2 text-sm text-muted">
            The coach view is for the team&apos;s coaches and admins. Ask an admin to give you the Coach role on the Team page.
          </p>
          <Link href={`/g/${id}`} className={`${btnPrimary} mt-5`}>
            Watch live →
          </Link>
        </div>
      </SiteShell>
    );
  }

  const [players, events, team, baselineGames, settings] = await Promise.all([
    fetchRoster(supabase, game.teamId, { includeInactive: true }),
    fetchGameEvents(supabase, id),
    supabase.from("teams").select("name").eq("id", game.teamId).maybeSingle(),
    loadBaselineGames(supabase, user.id, id),
    loadCoachSettings(supabase, game.teamId),
  ]);

  return (
    <SiteShell wide>
      <PageTitle
        title={`Coach view · vs ${game.opponentName}`}
        sub={game.status === "final" ? "Post-game review: drag the slider to replay" : "Live insights, coaches only"}
        action={
          <Link href="/analysis/settings#coach" className={btnGhost}>
            ⚙ Alert settings
          </Link>
        }
      />
      {settings.needsMigration && (
        <p className="mb-4 rounded-xl bg-warn-soft px-4 py-3 text-sm ring-1 ring-warn/50">
          Using default alert thresholds. Run <code className="font-bold">supabase/migrations/0008_coach_role.sql</code> in Supabase to
          customise them.
        </p>
      )}
      <CoachLive
        game={game}
        teamName={team.data?.name ?? "Us"}
        players={players}
        initialEvents={events}
        baselineGames={baselineGames}
        overrides={settings.overrides}
      />
    </SiteShell>
  );
}
