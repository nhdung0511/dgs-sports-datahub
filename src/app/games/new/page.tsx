import Link from "next/link";
import { Notice, PageTitle, SiteShell } from "@/components/site-shell";
import { btnPrimary } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { fetchRoster } from "@/lib/db/games";
import { getMyTeam } from "@/lib/db/teams";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { GameForm } from "./game-form";

export default async function NewGamePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!isSupabaseConfigured) return <SiteShell>{null}</SiteShell>;
  const { error } = await searchParams;
  const { supabase, user } = await requireUser("/games/new");
  const team = await getMyTeam(supabase, user.id);
  const roster = team ? await fetchRoster(supabase, team.id) : [];

  return (
    <SiteShell>
      <PageTitle title="New game" sub={team ? `${team.name} vs …` : undefined} />
      <Notice msg={error} tone="error" />
      {!team || roster.length < 5 ? (
        <div className="rounded-2xl border border-warn/50 bg-warn-soft p-6">
          <h2 className="text-lg font-bold">
            {team ? `Add at least 5 players first (you have ${roster.length})` : "Set up your team first"}
          </h2>
          <p className="mt-1 text-sm">You need a roster before you can score a game.</p>
          <Link href="/team" className={`${btnPrimary} mt-4`}>
            Go to Team &amp; roster →
          </Link>
        </div>
      ) : (
        <GameForm />
      )}
    </SiteShell>
  );
}
