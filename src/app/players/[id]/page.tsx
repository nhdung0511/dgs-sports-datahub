import Link from "next/link";
import { notFound } from "next/navigation";
import nbaSnapshot from "@/data/nba-players.json";
import { PageTitle, SiteShell } from "@/components/site-shell";
import { btnGhost } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { loadAnalysisSettings } from "@/lib/db/analysis-settings";
import { loadSeason } from "@/lib/db/season";
import { getMyTeam } from "@/lib/db/teams";
import type { NbaSnapshot } from "@/lib/sports/basketball/nba-comps";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { AnalysisGameData } from "@/app/analysis/shared";
import { PlayerProfile } from "./player-profile";

export const metadata = { title: "Player · DGS Sports Datahub" };

/** A player's profile with NBA style comps: team members only. */
export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured) return <SiteShell>{null}</SiteShell>;
  const { id } = await params;
  const { supabase, user } = await requireUser(`/players/${id}`);
  const member = await getMyTeam(supabase, user.id);

  if (!member) {
    return (
      <SiteShell>
        <PageTitle title="Player profile" />
        <div className="max-w-xl rounded-2xl border border-line bg-card p-6">
          <h2 className="text-lg font-bold">For team members only</h2>
          <p className="mt-2 text-sm text-muted">Ask a team admin to add your email on the Team page.</p>
        </div>
      </SiteShell>
    );
  }

  const [season, settings] = await Promise.all([loadSeason(supabase, user.id), loadAnalysisSettings(supabase, member.id)]);
  const player = season?.players.find((p) => p.id === id);
  if (!season || !player) notFound();

  const games: AnalysisGameData[] = season.games.map(({ game, box }) => ({
    id: game.id,
    opponent: game.opponentName,
    date: game.startsAt,
    opponentStats: Boolean(game.config.opponentStats),
    box,
  }));

  return (
    <SiteShell wide>
      <PageTitle
        title={`${player.jersey ? `#${player.jersey} ` : ""}${player.name}`}
        sub={`${member.name} · player profile · team only${player.active ? "" : " · inactive"}`}
        action={
          <Link href="/analysis" className={btnGhost}>
            ← Analysis
          </Link>
        }
      />
      <PlayerProfile
        player={player}
        players={season.players}
        games={games}
        archetypes={settings.archetypes}
        assignments={settings.assignments}
        nba={nbaSnapshot as NbaSnapshot}
      />
    </SiteShell>
  );
}
