"use client";

import { Legend, LineChart, type Series } from "@/components/charts";
import { StatTile } from "@/components/stat-tile";
import { duos, lineupRatings, teamAdvanced, teamGameTrend, type FourFactors, type UnitStats } from "@/lib/sports/basketball/advanced";
import { toAnalysisGames, type ViewProps } from "./shared";

const one = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);
const fmt = (v: number | null, suffix = "") => (v === null ? "–" : `${v.toFixed(1)}${suffix}`);
const signed = (v: number | null) => (v === null ? "–" : `${v > 0 ? "+" : ""}${v.toFixed(1)}`);

/** Team pace, ratings, four factors and the best duos/lineups for the selected games. */
export function TeamView({ games, nameOf }: ViewProps) {
  const chrono = [...games].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  const ag = toAnalysisGames(chrono);
  const t = teamAdvanced(ag);
  const trend = ag.map(teamGameTrend);
  const labels = chrono.map((g) => g.opponent.split(" ")[0]);
  const pairs = duos(ag).slice(0, 10);
  const fives = lineupRatings(ag).slice(0, 8);

  const ratingSeries: Series[] = [
    { name: "Off. rating", color: "var(--player-1)", values: trend.map((p) => one(p.ortg)) },
    { name: "Def. rating", color: "var(--player-3)", values: trend.map((p) => one(p.drtg)) },
  ];
  const shootingSeries: Series[] = [
    { name: "eFG%", color: "var(--player-1)", values: trend.map((p) => one(p.efgPct)) },
    { name: "TS%", color: "var(--player-2)", values: trend.map((p) => one(p.tsPct)) },
  ];
  const noFull = t.gamesFull === 0;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Pace and ratings are based on {t.gamesFull} of {t.gamesTotal} games (the ones recorded with opponent stats).
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatTile label="Pace" value={fmt(t.pace)} sub="possessions / 32 min" />
        <StatTile label="Off. rating" value={fmt(t.ortg)} sub="points / 100 poss." />
        <StatTile label="Def. rating" value={fmt(t.drtg)} sub="allowed / 100 poss." />
        <StatTile label="Net rating" value={signed(t.netRtg)} sub="off. − def." />
        <StatTile label="True shooting" value={fmt(t.tsPct, "%")} sub={`all ${t.gamesTotal} games`} />
      </div>

      <section className="rounded-2xl border border-line bg-card p-4 sm:p-5">
        <h2 className="text-lg font-black">Four factors</h2>
        <p className="mb-3 text-sm text-muted">What usually decides games, for DGS and its opponents.</p>
        {noFull ? (
          <p className="text-sm text-muted">Needs at least one game recorded with opponent stats.</p>
        ) : (
          <FactorsTable us={t.us} opp={t.opp} />
        )}
      </section>

      <section className="rounded-2xl border border-line bg-card p-4 sm:p-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-black">Offensive vs defensive rating by game</h2>
          <Legend series={ratingSeries} />
        </div>
        {noFull ? (
          <p className="text-sm text-muted">Needs games recorded with opponent stats.</p>
        ) : (
          <LineChart labels={labels} series={ratingSeries} directLabels={false} label="Offensive and defensive rating by game" />
        )}
        <p className="mt-1 text-xs text-muted">Gaps are older games without opponent stats. Higher offense and lower defense are better.</p>
      </section>

      <section className="rounded-2xl border border-line bg-card p-4 sm:p-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-black">Shooting efficiency by game</h2>
          <Legend series={shootingSeries} />
        </div>
        <LineChart labels={labels} series={shootingSeries} unit="%" directLabels={false} label="eFG% and TS% by game" />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <UnitTable title="Best duos" sub="Pairs with 2+ minutes together" units={pairs} nameOf={nameOf} />
        <UnitTable title="Best lineups" sub="Five-player units with 2+ minutes" units={fives} nameOf={nameOf} />
      </div>
    </div>
  );
}

function FactorsTable({ us, opp }: { us: FourFactors; opp: FourFactors }) {
  const rows: [string, string, keyof FourFactors, boolean][] = [
    ["Shooting", "eFG%", "efgPct", false],
    ["Turnovers", "TOV%", "tovPct", true],
    ["Offensive rebounding", "OREB%", "orebPct", false],
    ["Getting to the line", "FT rate", "ftRate", false],
  ];
  return (
    <table className="w-full text-sm">
      <thead className="text-xs uppercase tracking-wide text-muted">
        <tr>
          <th scope="col" className="py-1.5 text-left">Factor</th>
          <th scope="col" className="py-1.5 text-right">DGS</th>
          <th scope="col" className="py-1.5 text-right">Opponents</th>
          <th scope="col" className="py-1.5 text-right">Edge</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map(([name, short, key, lowerBetter]) => {
          const a = us[key];
          const b = opp[key];
          const better = a !== null && b !== null && a !== b ? (lowerBetter ? a < b : a > b) : null;
          return (
            <tr key={key}>
              <th scope="row" className="py-2 text-left font-medium">
                {name} <span className="text-xs text-muted">({short})</span>
              </th>
              <td className="py-2 text-right tabular-nums">{fmt(a, "%")}</td>
              <td className="py-2 text-right tabular-nums">{fmt(b, "%")}</td>
              <td className="py-2 text-right text-xs font-bold">{better === null ? "–" : better ? "✓ DGS" : "Opponents"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function UnitTable({ title, sub, units, nameOf }: { title: string; sub: string; units: UnitStats[]; nameOf: (id: string) => string }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      <h2 className="text-lg font-black">{title}</h2>
      <p className="mb-3 text-sm text-muted">{sub}, best net rating first.</p>
      {units.length === 0 ? (
        <p className="text-sm text-muted">Not enough minutes together yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[24rem] text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="py-1.5 text-left">Players</th>
                <th scope="col" className="whitespace-nowrap py-1.5 pl-3 text-right">MIN</th>
                <th scope="col" className="whitespace-nowrap py-1.5 pl-3 text-right">+/-</th>
                <th scope="col" className="whitespace-nowrap py-1.5 pl-3 text-right">Net rtg</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {units.map((u) => (
                <tr key={u.players.join("|")}>
                  <td className="py-2 pr-2">{u.players.map(nameOf).join(", ")}</td>
                  <td className="whitespace-nowrap py-2 pl-3 text-right tabular-nums">{Math.round(u.seconds / 60)}</td>
                  <td className="whitespace-nowrap py-2 pl-3 text-right tabular-nums">{u.plusMinus > 0 ? `+${u.plusMinus}` : u.plusMinus}</td>
                  <td className="whitespace-nowrap py-2 pl-3 text-right tabular-nums">{signed(u.netRtg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
