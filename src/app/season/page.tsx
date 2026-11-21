import Link from "next/link";
import { PageTitle, SiteShell } from "@/components/site-shell";
import { StatTile } from "@/components/stat-tile";
import { getSessionUser } from "@/lib/auth";
import { safeFilename } from "@/lib/csv";
import { loadSeason } from "@/lib/db/season";
import { pct, seasonTotals, teamGameRows, teamLine, winLoss } from "@/lib/sports/basketball/season";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { SeasonTable } from "./season-table";

export default async function SeasonPage() {
  if (!isSupabaseConfigured) return <SiteShell>{null}</SiteShell>;
  const { supabase, user } = await getSessionUser();
  const season = await loadSeason(supabase, user?.id);

  if (!season || season.games.length === 0) {
    return (
      <SiteShell>
        <PageTitle title="Season stats" />
        <p className="rounded-2xl border-2 border-dashed border-line p-8 text-center text-muted">
          Stats appear here once a game is finished.{" "}
          <Link href="/games" className="font-bold text-cyan underline">
            See games
          </Link>
        </p>
      </SiteShell>
    );
  }

  const boxes = season.games.map((g) => g.box);
  const totals = seasonTotals(boxes);
  const rows = teamGameRows(season.games);
  const rec = winLoss(rows);
  const n = season.games.length;
  const team = boxes.reduce(
    (acc, b) => {
      const t = teamLine(b);
      acc.fgm += t.fgm;
      acc.fga += t.fga;
      acc.tpm += t.tpm;
      acc.tpa += t.tpa;
      acc.us += b.score.us;
      acc.opp += b.score.opp;
      return acc;
    },
    { fgm: 0, fga: 0, tpm: 0, tpa: 0, us: 0, opp: 0 },
  );

  return (
    <SiteShell wide>
      <PageTitle title="Season stats" sub={`${season.team.name} · ${n} finished game${n === 1 ? "" : "s"}`} />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Record" value={`${rec.w}–${rec.l}${rec.t ? `–${rec.t}` : ""}`} />
        <StatTile label="Points per game" value={(team.us / n).toFixed(1)} sub={`Allowing ${(team.opp / n).toFixed(1)}`} />
        <StatTile label="Field goal %" value={`${pct(team.fgm, team.fga) ?? "–"}%`} sub={`${team.fgm} of ${team.fga}`} />
        <StatTile label="3-point %" value={`${pct(team.tpm, team.tpa) ?? "–"}%`} sub={`${team.tpm} of ${team.tpa}`} />
      </div>
      <SeasonTable players={season.players} totals={totals} filename={safeFilename(`${season.team.name} season`)} />
      <p className="mt-3 text-xs text-muted">Only finished games count. GP = games played.</p>
    </SiteShell>
  );
}
