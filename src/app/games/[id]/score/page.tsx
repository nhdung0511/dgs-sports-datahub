import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteShell } from "@/components/site-shell";
import { btnPrimary } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { fetchGameEvents } from "@/lib/db/events";
import { fetchGame, fetchRoster } from "@/lib/db/games";
import { loadBaselineGames, loadCoachSettings } from "@/lib/db/coach";
import { canEdit, getMyTeam, isCoach } from "@/lib/db/teams";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { Scorer } from "./scorer";

export default async function ScorePage({ params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured) return <SiteShell>{null}</SiteShell>;
  const { id } = await params;
  const { supabase, user } = await requireUser(`/games/${id}/score`);
  const game = await fetchGame(supabase, id);
  if (!game) notFound();

  // One scorekeeper per game, and only while they're an editor: everyone else gets the live view.
  const member = await getMyTeam(supabase, user.id);
  if (game.scorekeeperId !== user.id || !canEdit(member?.role)) {
    return (
      <SiteShell>
        <div className="mx-auto max-w-lg rounded-2xl border border-line bg-card p-6 text-center">
          <h1 className="text-xl font-black">Someone else is keeping score</h1>
          <p className="mt-2 text-sm text-muted">
            Only the game&apos;s scorekeeper can record plays, so two devices never clash. You can still follow
            it live.
          </p>
          <Link href={`/g/${id}`} className={`${btnPrimary} mt-5`}>
            Watch live →
          </Link>
        </div>
      </SiteShell>
    );
  }

  const coaching = isCoach(member?.role) && member?.id === game.teamId;
  const [players, events, coach] = await Promise.all([
    fetchRoster(supabase, game.teamId),
    fetchGameEvents(supabase, id),
    coaching
      ? Promise.all([loadBaselineGames(supabase, user.id, id), loadCoachSettings(supabase, game.teamId)]).then(
          ([baselineGames, settings]) => ({ baselineGames, overrides: settings.overrides, teamName: member!.name }),
        )
      : Promise.resolve(undefined),
  ]);

  return <Scorer game={game} players={players} initialEvents={events} coach={coach} />;
}
