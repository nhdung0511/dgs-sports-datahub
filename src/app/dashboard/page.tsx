import Link from "next/link";
import { GroupedBarChart, Legend, LineChart, type Series } from "@/components/charts";
import { PageTitle, SiteShell } from "@/components/site-shell";
import { StatTile } from "@/components/stat-tile";
import { card } from "@/components/ui";
import { getSessionUser } from "@/lib/auth";
import { loadSeason } from "@/lib/db/season";
import { periodLabel } from "@/lib/sports/basketball/period";
import { periodAverages, seasonLineups, teamGameRows, winLoss } from "@/lib/sports/basketball/season";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default async function DashboardPage() {
  if (!isSupabaseConfigured) return <SiteShell>{null}</SiteShell>;
  const { supabase, user } = await getSessionUser();
  const season = await loadSeason(supabase, user?.id);

  if (!season || season.games.length === 0) {
    return (
      <SiteShell>
        <PageTitle title="Dashboard" />
        <p className="rounded-2xl border-2 border-dashed border-line p-8 text-center text-muted">
          Charts appear once a game is finished.{" "}
          <Link href="/games" className="font-bold text-cyan underline">
            See games
          </Link>
        </p>
      </SiteShell>
    );
  }

  const { team, players, games } = season;
  const chrono = [...games].reverse(); // oldest → newest for trends
  const rows = teamGameRows(chrono);
  const rec = winLoss(rows);
  const boxes = chrono.map((g) => g.box);
  // Use the most common format for period labels.
  const config = chrono[chrono.length - 1].game.config;
  const byPeriod = periodAverages(boxes, config.periodCount);
  const lineups = seasonLineups(boxes).slice(0, 8);
  const nameOf = (id: string) => {
    const p = players.find((x) => x.id === id);
    return p ? `#${p.jersey ?? "–"} ${p.name.split(" ").slice(-1)[0]}` : "?";
  };
  const margin = rows.reduce((s, r) => s + (r.us - r.opp), 0) / rows.length;
  const last5 = rows.slice(-5).map((r) => r.result).join(" ");

  const periodSeries: Series[] = [
    { name: team.name, color: "var(--series-1)", values: byPeriod.map((p) => p.us) },
    { name: "Opponents", color: "var(--series-2)", values: byPeriod.map((p) => p.opp) },
  ];
  const shootingSeries: Series[] = [
    { name: "FG%", color: "var(--series-1)", values: rows.map((r) => r.fgPct) },
    { name: "3P%", color: "var(--series-2)", values: rows.map((r) => r.tpPct) },
  ];
  const gameLabels = rows.map((r) => `${r.opponent.split(" ")[0]}`);

  return (
    <SiteShell wide>
      <PageTitle title="Dashboard" sub={`${team.name} · ${rows.length} finished games`} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Record" value={`${rec.w}–${rec.l}${rec.t ? `–${rec.t}` : ""}`} sub={`Last 5: ${last5}`} />
        <StatTile
          label="Avg margin"
          value={`${margin > 0 ? "+" : ""}${margin.toFixed(1)}`}
          sub="Points per game vs opponents"
        />
        <StatTile
          label="Best quarter"
          value={periodLabel(config, [...byPeriod].sort((a, b) => b.us - b.opp - (a.us - a.opp))[0].period)}
          sub="Biggest scoring edge"
        />
        <StatTile
          label="Top lineup"
          value={lineups[0] ? `${lineups[0].plusMinus > 0 ? "+" : ""}${lineups[0].plusMinus}` : "–"}
          sub={lineups[0] ? `${Math.round(lineups[0].seconds / 60)} min together` : "Needs 2+ min together"}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className={`${card} p-5`}>
          <h2 className="font-black">Average points by {config.periodCount === 2 ? "half" : "quarter"}</h2>
          <p className="mb-3 text-sm text-muted">Where games are won and lost. Hover a period for exact numbers.</p>
          <Legend series={periodSeries} />
          <GroupedBarChart
            label="Average points scored and allowed per period"
            categories={byPeriod.map((p) => periodLabel(config, p.period))}
            series={periodSeries}
          />
        </section>

        <section className={`${card} p-5`}>
          <h2 className="font-black">Shooting by game</h2>
          <p className="mb-3 text-sm text-muted">Field goal and 3-point percentage, oldest game on the left.</p>
          <Legend series={shootingSeries} />
          <LineChart label="Shooting percentage by game" labels={gameLabels} series={shootingSeries} unit="%" max={100} />
        </section>
      </div>

      <section className={`${card} mt-6 overflow-hidden`}>
        <div className="p-5 pb-3">
          <h2 className="font-black">Best five-player lineups</h2>
          <p className="text-sm text-muted">Points scored minus points allowed while these five shared the court (2+ minutes).</p>
        </div>
        {lineups.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted">Not enough lineup data yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="bg-card-2 text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 text-left">Lineup</th>
                  <th className="px-3 py-2 text-right">MIN</th>
                  <th className="px-3 py-2 text-right">PTS FOR</th>
                  <th className="px-3 py-2 text-right">AGAINST</th>
                  <th className="px-4 py-2 text-right">+/-</th>
                </tr>
              </thead>
              <tbody>
                {lineups.map((l) => (
                  <tr key={l.players.join("|")} className="border-t border-line">
                    <td className="px-4 py-2">{l.players.map(nameOf).join(", ")}</td>
                    <td className="px-3 py-2 text-right">{Math.round(l.seconds / 60)}</td>
                    <td className="px-3 py-2 text-right">{l.pointsFor}</td>
                    <td className="px-3 py-2 text-right">{l.pointsAgainst}</td>
                    <td className={`px-4 py-2 text-right font-black ${l.plusMinus > 0 ? "text-lime" : l.plusMinus < 0 ? "text-opp" : ""}`}>
                      {l.plusMinus > 0 ? `+${l.plusMinus}` : l.plusMinus}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={`${card} mt-6 overflow-hidden`}>
        <h2 className="p-5 pb-3 font-black">Game log</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="bg-card-2 text-xs text-muted">
              <tr>
                <th className="px-4 py-2 text-left">Opponent</th>
                <th className="px-3 py-2 text-right">Result</th>
                <th className="px-3 py-2 text-right">Score</th>
                <th className="px-3 py-2 text-right">FG%</th>
                <th className="px-3 py-2 text-right">3P%</th>
                <th className="px-4 py-2 text-right">FT%</th>
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((r) => (
                <tr key={r.gameId} className="border-t border-line">
                  <td className="px-4 py-2">
                    <Link href={`/g/${r.gameId}`} className="font-medium hover:text-cyan hover:underline">
                      vs {r.opponent}
                    </Link>
                  </td>
                  <td className={`px-3 py-2 text-right font-black ${r.result === "W" ? "text-lime" : r.result === "L" ? "text-opp" : ""}`}>
                    {r.result}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.us}–{r.opp}
                  </td>
                  <td className="px-3 py-2 text-right">{r.fgPct ?? "–"}</td>
                  <td className="px-3 py-2 text-right">{r.tpPct ?? "–"}</td>
                  <td className="px-4 py-2 text-right">{r.ftPct ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </SiteShell>
  );
}
