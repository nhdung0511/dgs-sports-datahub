import Link from "next/link";
import { PageTitle, SiteShell } from "@/components/site-shell";
import { requireUser } from "@/lib/auth";
import { getMyTeam } from "@/lib/db/teams";
import { loadSeason } from "@/lib/db/season";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { AnalysisApp } from "./analysis-app";
import type { AnalysisGameData } from "./shared";

export const metadata = { title: "Analysis · DGS Sports Datahub" };

/** Team-only advanced stats (see docs/analysis-plan.md). */
export default async function AnalysisPage() {
  if (!isSupabaseConfigured) return <SiteShell>{null}</SiteShell>;
  const { supabase, user } = await requireUser("/analysis");
  const member = await getMyTeam(supabase, user.id);

  if (!member) {
    return (
      <SiteShell>
        <PageTitle title="Analysis" />
        <div className="max-w-xl rounded-2xl border border-line bg-card p-6">
          <h2 className="text-lg font-bold">For team members only</h2>
          <p className="mt-2 text-sm text-muted">
            Advanced stats are visible to the team&apos;s coaches, scorekeepers and players. Ask a team admin to add
            your email on the Team page. Box scores and season stats are public on the{" "}
            <Link href="/season" className="font-bold text-cyan underline">
              Season
            </Link>{" "}
            page.
          </p>
        </div>
      </SiteShell>
    );
  }

  const season = await loadSeason(supabase, user.id);
  const games: AnalysisGameData[] = (season?.games ?? []).map(({ game, box }) => ({
    id: game.id,
    opponent: game.opponentName,
    date: game.startsAt,
    opponentStats: Boolean(game.config.opponentStats),
    box,
  }));

  return (
    <SiteShell wide>
      <PageTitle title="Analysis" sub={`${member.name} · advanced stats · team only`} />
      {games.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-line p-8 text-center text-muted">
          Analysis appears once a game is finished.{" "}
          <Link href="/games" className="font-bold text-cyan underline">
            See games
          </Link>
        </p>
      ) : (
        <AnalysisApp players={season?.players ?? []} games={games} />
      )}
    </SiteShell>
  );
}
