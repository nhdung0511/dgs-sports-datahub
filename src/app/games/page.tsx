import Link from "next/link";
import { GameCard } from "@/components/game-card";
import { PageTitle, SiteShell } from "@/components/site-shell";
import { btnAccent } from "@/components/ui";
import { getSessionUser } from "@/lib/auth";
import { listGames, loadGamesWithBox } from "@/lib/db/games";
import { getClubTeam, getMyTeam } from "@/lib/db/teams";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default async function GamesPage() {
  if (!isSupabaseConfigured) return <SiteShell>{null}</SiteShell>;
  const { supabase, user } = await getSessionUser();
  const team = await getClubTeam(supabase, user?.id);
  const mine = user ? await getMyTeam(supabase, user.id) : null;
  const games = team ? await loadGamesWithBox(supabase, await listGames(supabase, team.id)) : [];

  return (
    <SiteShell>
      <PageTitle
        title="Games"
        sub={team ? `All ${team.name} games` : undefined}
        action={
          mine && (
            <Link href="/games/new" className={btnAccent}>
              + New game
            </Link>
          )
        }
      />
      {games.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-line p-8 text-center text-muted">
          No games yet.{" "}
          {mine ? (
            <Link href="/games/new" className="font-bold text-cyan underline">
              Create the first one
            </Link>
          ) : (
            "Check back soon."
          )}
        </p>
      ) : (
        <ul className="space-y-3">
          {games.map((g) => (
            <GameCard key={g.game.id} item={g} canScore={Boolean(mine && g.game.scorekeeperId === user?.id)} />
          ))}
        </ul>
      )}
    </SiteShell>
  );
}
