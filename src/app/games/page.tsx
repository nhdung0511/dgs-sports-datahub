import Link from "next/link";
import { GameCard } from "@/components/game-card";
import { PageTitle, SiteShell } from "@/components/site-shell";
import { btnAccent } from "@/components/ui";
import { getSessionUser } from "@/lib/auth";
import { listGames, loadGamesWithBox } from "@/lib/db/games";
import { canEdit, getClubTeam, getMyTeam } from "@/lib/db/teams";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default async function GamesPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string; error?: string }>;
}) {
  const sp = await searchParams;
  if (!isSupabaseConfigured) return <SiteShell>{null}</SiteShell>;
  const { supabase, user } = await getSessionUser();
  const team = await getClubTeam(supabase, user?.id);
  const member = user ? await getMyTeam(supabase, user.id) : null;
  // Only admins and scorekeepers can create, score or delete games (players are view-only).
  const mine = member && canEdit(member.role) ? member : null;
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
      {sp.deleted && (
        <p className="mb-4 rounded-xl bg-lime-soft px-4 py-3 text-sm ring-1 ring-lime/40">Game deleted.</p>
      )}
      {sp.error && (
        <p className="mb-4 rounded-xl bg-opp-soft px-4 py-3 text-sm ring-1 ring-opp/40">{sp.error}</p>
      )}
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
            <GameCard
              key={g.game.id}
              item={g}
              canScore={Boolean(mine && g.game.scorekeeperId === user?.id)}
              canDelete={Boolean(mine && (mine.role === "admin" || g.game.scorekeeperId === user?.id))}
            />
          ))}
        </ul>
      )}
    </SiteShell>
  );
}
