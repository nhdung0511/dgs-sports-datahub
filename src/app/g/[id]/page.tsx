import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteShell } from "@/components/site-shell";
import { fetchGameEvents } from "@/lib/db/events";
import { fetchGame, fetchRoster } from "@/lib/db/games";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { LiveGame } from "./live-game";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  if (!isSupabaseConfigured) return {};
  const { id } = await params;
  const game = await fetchGame(await createClient(), id);
  return game ? { title: `vs ${game.opponentName} · DGS Sports Datahub` } : {};
}

/** Public, no-login game page: the link shared with fans. */
export default async function PublicGamePage({ params }: Params) {
  if (!isSupabaseConfigured) return <SiteShell>{null}</SiteShell>;
  const { id } = await params;
  const supabase = await createClient();
  const game = await fetchGame(supabase, id);
  if (!game) notFound();
  const [players, events, team] = await Promise.all([
    fetchRoster(supabase, game.teamId, { includeInactive: true }),
    fetchGameEvents(supabase, id),
    supabase.from("teams").select("name").eq("id", game.teamId).maybeSingle(),
  ]);

  return (
    <SiteShell wide>
      <LiveGame game={game} teamName={team.data?.name ?? "Us"} players={players} initialEvents={events} />
    </SiteShell>
  );
}
