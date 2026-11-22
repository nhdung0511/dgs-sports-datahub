"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Legend, LineChart, type Series } from "@/components/charts";
import { StatTile } from "@/components/stat-tile";
import { card } from "@/components/ui";
import { buildRows, metricPercentiles, toAnalysisGames, type AnalysisGameData } from "@/app/analysis/shared";
import { defaultMinMinutes, gameScore, seasonOf } from "@/lib/sports/basketball/advanced";
import {
  archetypeMetrics,
  archetypeRating,
  benchmarkScore,
  benchmarkValue,
  detectArchetype,
  GOAL_RING,
  type Archetype,
} from "@/lib/sports/basketball/archetypes";
import { formatMetric, METRICS } from "@/lib/sports/basketball/metrics";
import {
  confidenceOf,
  nbaComps,
  STYLE_KEYS,
  STYLE_LABELS,
  styleOf,
  type Comp,
  type Confidence,
  type NbaSnapshot,
} from "@/lib/sports/basketball/nba-comps";
import type { Player } from "@/lib/sports/types";

type Window = "season" | "last5" | "last10" | "career";
const WINDOWS: [Window, string][] = [
  ["season", "This season"],
  ["last5", "Last 5"],
  ["last10", "Last 10"],
  ["career", "Career"],
];

interface Props {
  player: Player;
  players: Player[];
  /** Final games, newest first. */
  games: AnalysisGameData[];
  archetypes: Archetype[];
  assignments: Record<string, string>;
  nba: NbaSnapshot;
}

const f1 = (v: number | null | undefined, suffix = "") => (v == null || !Number.isFinite(v) ? "–" : `${v.toFixed(1)}${suffix}`);
const pctStr = (m: number, a: number) => (a > 0 ? `${((100 * m) / a).toFixed(1)}%` : "–");

export function PlayerProfile({ player, players, games, archetypes, assignments, nba }: Props) {
  const [win, setWin] = useState<Window>("season");
  const thisSeason = games[0] ? seasonOf(games[0].date) : null;

  // Games in the window, then only the ones this player appeared in for the log/trends.
  const windowGames = useMemo(() => {
    if (win === "season") return games.filter((g) => seasonOf(g.date) === thisSeason);
    if (win === "last5" || win === "last10") {
      const n = win === "last5" ? 5 : 10;
      return games.filter((g) => g.box.players[player.id]).slice(0, n);
    }
    return games;
  }, [games, win, thisSeason, player.id]);
  const played = useMemo(() => windowGames.filter((g) => g.box.players[player.id]), [windowGames, player.id]);

  const minMinutes = useMemo(() => defaultMinMinutes(toAnalysisGames(windowGames)), [windowGames]);
  const rows = useMemo(() => buildRows(players, windowGames, minMinutes), [players, windowGames, minMinutes]);
  const me = rows.find((r) => r.player.id === player.id) ?? null;

  const pcts = useMemo(
    () => Object.fromEntries(METRICS.map((m) => [m.key, metricPercentiles(rows, m, "per32", minMinutes)])),
    [rows, minMinutes],
  );
  const pctOf = (key: string) => pcts[key]?.[player.id] ?? null;

  const assigned = archetypes.find((a) => a.id === assignments[player.id]) ?? null;
  const role = assigned
    ? { archetype: assigned, rating: archetypeRating(assigned, pctOf), source: "assigned" as const }
    : (() => {
        const best = detectArchetype(archetypes, pctOf);
        return best ? { ...best, source: "auto" as const } : null;
      })();

  // NBA comps: standardise against teammates with real minutes in the same games.
  const comps = useMemo(() => {
    if (!me) return [];
    const poolMin = Math.min(minMinutes, 20);
    const team = rows.filter((r) => r.adv.minutes >= poolMin || r.player.id === player.id).map((r) => styleOf(r.adv));
    return nbaComps(styleOf(me.adv), team, nba.players, 3);
  }, [me, rows, minMinutes, nba.players, player.id]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex rounded-full p-0.5 ring-1 ring-line">
          {WINDOWS.map(([k, l]) => (
            <button key={k} onClick={() => setWin(k)} className={`rounded-full px-3 py-1 font-bold ${win === k ? "bg-brand text-brand-fg" : "text-muted"}`}>
              {k === "season" && thisSeason ? thisSeason : l}
            </button>
          ))}
        </span>
        <span className="text-muted">
          {played.length} game{played.length === 1 ? "" : "s"} · {f1(me?.adv.minutes)} min
        </span>
      </div>

      {!me ? (
        <p className="rounded-2xl border-2 border-dashed border-line p-8 text-center text-muted">No finished games for this player in this range.</p>
      ) : (
        <>
          <SeasonLine row={me} />
          <NbaComps comps={comps} minutes={me.adv.minutes} nba={nba} name={player.name.split(" ")[0]} />
          <Role role={role} me={me} />
          <Trends played={[...played].reverse()} playerId={player.id} />
          <GameLog played={played} playerId={player.id} />
        </>
      )}
    </div>
  );
}

type Row = ReturnType<typeof buildRows>[number];

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className={`${card} min-w-0 p-4 sm:p-5`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-black">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function SeasonLine({ row }: { row: Row }) {
  const l = row.agg.all.line;
  const gp = row.adv.gp || 1;
  const pg = (v: number) => (v / gp).toFixed(1);
  const adv = row.adv;
  return (
    <Section title="Stat line">
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        <StatTile label="PTS" value={pg(l.pts)} sub="per game" />
        <StatTile label="REB" value={pg(l.reb)} sub="per game" />
        <StatTile label="AST" value={pg(l.ast)} sub="per game" />
        <StatTile label="STL" value={pg(l.stl)} sub="per game" />
        <StatTile label="BLK" value={pg(l.blk)} sub="per game" />
        <StatTile label="MIN" value={(adv.minutes / gp).toFixed(1)} sub={`${adv.gp} GP`} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-4">
        {[
          ["FG", `${l.fgm}/${l.fga} · ${pctStr(l.fgm, l.fga)}`],
          ["3P", `${l.tpm}/${l.tpa} · ${pctStr(l.tpm, l.tpa)}`],
          ["FT", `${l.ftm}/${l.fta} · ${pctStr(l.ftm, l.fta)}`],
          ["TOV / PF", `${pg(l.tov)} / ${pg(l.pf)}`],
          ["TS%", f1(adv.tsPct, "%")],
          ["eFG%", f1(adv.efgPct, "%")],
          ["USG%", f1(adv.usgPct, "%")],
          ["AST%", f1(adv.astPct, "%")],
          ["TOV%", f1(adv.tovPct, "%")],
          ["REB%", f1(adv.rebPct, "%")],
          ["On-Off net", adv.onOffNet == null ? "–" : `${adv.onOffNet > 0 ? "+" : ""}${adv.onOffNet.toFixed(1)}`],
          ["GmSc / 32", f1(adv.gameScorePer32)],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2 border-b border-line py-1">
            <dt className="text-muted">{k}</dt>
            <dd className="font-bold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

const CONF_STYLE: Record<Confidence, string> = {
  Low: "bg-warn-soft ring-warn/50",
  Medium: "bg-cyan-soft ring-cyan/40",
  High: "bg-lime-soft ring-lime/50",
};

function NbaComps({ comps, minutes, nba, name }: { comps: Comp[]; minutes: number; nba: NbaSnapshot; name: string }) {
  const [pick, setPick] = useState(0);
  const conf = confidenceOf(minutes);
  const c = comps[Math.min(pick, comps.length - 1)];
  return (
    <Section
      title="Plays like (NBA)"
      action={
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${CONF_STYLE[conf]}`}
          title="Based on minutes played in the chosen games: under 60 is low, 200+ is high."
        >
          {conf} confidence · {Math.round(minutes)} min
        </span>
      }
    >
      {comps.length === 0 ? (
        <p className="text-sm text-muted">Not enough stats yet to compare.</p>
      ) : (
        <>
          <ol className="grid grid-cols-3 gap-2">
            {comps.map((cp, i) => (
              <li key={cp.nba.id}>
                <button
                  onClick={() => setPick(i)}
                  className={`h-full w-full rounded-xl p-2.5 text-left ring-1 sm:p-3 ${i === pick ? "bg-brand text-brand-fg ring-brand" : "bg-card-2 ring-line hover:ring-muted"}`}
                >
                  <div className="text-xs font-bold opacity-80">
                    #{i + 1} · {cp.nba.team}
                  </div>
                  <div className="text-sm font-black leading-tight sm:text-base">{cp.nba.name}</div>
                  <div className="text-xl font-black tabular-nums sm:text-2xl">{cp.similarity}%</div>
                  <div className="text-xs opacity-80">similar</div>
                </button>
              </li>
            ))}
          </ol>
          {c && (
            <div className="mt-4 grid items-start gap-6 md:grid-cols-[1fr_18rem]">
              <StyleBars comp={c} name={name} />
              <StyleRadar comp={c} name={name} />
            </div>
          )}
          <p className="mt-3 text-xs text-muted">
            Compares playing <i>style</i>, not level: each stat is ranked within its own pool ({name} among teammates, {c?.nba.name.split(" ").slice(-1)[0]} among{" "}
            {nba.players.length} NBA rotation players, {nba.season}). Rebound, steal and block stats need games scored with opponent stats.
          </p>
        </>
      )}
    </Section>
  );
}

function StyleBars({ comp, name }: { comp: Comp; name: string }) {
  const closest = [...comp.rows].filter((r) => r.gap !== null).sort((a, b) => a.gap! - b.gap!);
  const near = new Set(closest.slice(0, 2).map((r) => r.key));
  const far = new Set(closest.slice(-2).map((r) => r.key));
  return (
    <div className="space-y-2 text-sm">
      <div className="flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1">
          <span className="h-2 w-4 rounded-sm bg-[var(--player-1)]" /> {name}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-4 rounded-sm bg-[var(--player-2)]" /> {comp.nba.name.split(" ").slice(-1)[0]}
        </span>
        <span>· percentile in own pool</span>
      </div>
      {comp.rows.map((r) => (
        <div key={r.key} title={STYLE_LABELS[r.key].help}>
          <div className="flex justify-between gap-2 text-xs">
            <span className="font-bold">
              {STYLE_LABELS[r.key].label}
              {near.has(r.key) && <span className="ml-1 text-lime-strong">closest</span>}
              {far.has(r.key) && !near.has(r.key) && <span className="ml-1 text-warn">biggest gap</span>}
            </span>
            <span className="shrink-0 tabular-nums text-muted">
              {f1(r.ours, "%")} vs {f1(r.theirs, "%")}
            </span>
          </div>
          <Bar pct={r.oursPct} color="var(--player-1)" />
          <Bar pct={r.theirsPct} color="var(--player-2)" />
        </div>
      ))}
    </div>
  );
}

function Bar({ pct, color }: { pct: number | null; color: string }) {
  return (
    <div className="mt-0.5 h-2 rounded-full bg-card-2">
      {pct !== null && <div className="h-2 rounded-full" style={{ width: `${Math.max(2, pct)}%`, background: color }} />}
    </div>
  );
}

function StyleRadar({ comp, name }: { comp: Comp; name: string }) {
  const S = 260;
  const R = 80;
  const c = S / 2;
  const n = STYLE_KEYS.length;
  const at = (i: number, p: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [c + Math.cos(a) * (R * p) / 100, c + Math.sin(a) * (R * p) / 100] as const;
  };
  const shape = (key: "oursPct" | "theirsPct") => comp.rows.map((r, i) => at(i, r[key] ?? 0).join(",")).join(" ");
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="mx-auto h-auto w-full max-w-[18rem]" role="img" aria-label={`Style radar: ${name} vs ${comp.nba.name}`}>
      {[25, 50, 75, 100].map((p) => (
        <polygon key={p} points={STYLE_KEYS.map((_, i) => at(i, p).join(",")).join(" ")} fill="none" stroke="var(--line)" />
      ))}
      {STYLE_KEYS.map((k, i) => {
        const [x, y] = at(i, 100);
        const [lx, ly] = at(i, 122);
        return (
          <g key={k}>
            <line x1={c} y1={c} x2={x} y2={y} stroke="var(--line)" />
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize="8" fill="var(--muted)">
              {STYLE_LABELS[k].label}
            </text>
          </g>
        );
      })}
      <polygon points={shape("theirsPct")} fill="var(--player-2)" fillOpacity={0.18} stroke="var(--player-2)" strokeWidth={2} />
      <polygon points={shape("oursPct")} fill="var(--player-1)" fillOpacity={0.18} stroke="var(--player-1)" strokeWidth={2} />
    </svg>
  );
}

function Role({ role, me }: { role: { archetype: Archetype; rating: number | null; source: "assigned" | "auto" } | null; me: Row }) {
  return (
    <Section
      title="Role & goals"
      action={
        role && (
          <span className="rounded-full bg-card-2 px-3 py-1 text-xs font-bold ring-1 ring-line">
            {role.source === "assigned" ? "Coach-assigned" : "Auto-detected"} · rating {role.rating ?? "–"}
          </span>
        )
      }
    >
      {!role ? (
        <p className="text-sm text-muted">Not enough minutes to judge a role yet.</p>
      ) : (
        <>
          <p className="text-xl font-black">{role.archetype.name}</p>
          {role.archetype.description && <p className="text-sm text-muted">{role.archetype.description}</p>}
          <ul className="mt-3 space-y-2 text-sm">
            {archetypeMetrics(role.archetype).map(({ metric, goal }) => {
              const v = benchmarkValue(metric, me.agg, me.adv);
              const score = benchmarkScore(v, goal, metric.lowerIsBetter);
              const hit = score !== null && score >= GOAL_RING;
              return (
                <li key={metric.key} title={metric.help}>
                  <div className="flex justify-between text-xs">
                    <span className="font-bold">
                      {metric.label}
                      {metric.counting && <span className="font-normal text-muted"> /32</span>}
                    </span>
                    <span className="tabular-nums">
                      <b className={hit ? "text-lime-strong" : ""}>{formatMetric(metric, v)}</b>
                      <span className="text-muted">
                        {" "}
                        · goal {metric.lowerIsBetter ? "≤" : "≥"} {formatMetric(metric, goal)}
                      </span>
                    </span>
                  </div>
                  <div className="relative mt-0.5 h-2 rounded-full bg-card-2">
                    {score !== null && (
                      <div
                        className={`h-2 rounded-full ${hit ? "bg-lime-strong" : "bg-cyan"}`}
                        style={{ width: `${Math.min(100, (score / GOAL_RING) * 100)}%` }}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-muted">
            Bars fill to the goal. Change archetypes and goals on{" "}
            <Link href="/analysis/settings" className="font-bold text-cyan underline">
              Analysis settings
            </Link>
            .
          </p>
        </>
      )}
    </Section>
  );
}

function Trends({ played, playerId }: { played: AnalysisGameData[]; playerId: string }) {
  if (played.length < 2) return null;
  const labels = played.map((g) => (g.date ? new Date(g.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : g.opponent));
  const lines = played.map((g) => g.box.players[playerId]);
  const scoring: Series[] = [
    { name: "Points", color: "var(--player-1)", values: lines.map((l) => l.pts) },
    { name: "Game Score", color: "var(--player-2)", values: lines.map((l) => Math.round(gameScore(l) * 10) / 10) },
    { name: "Minutes", color: "var(--player-3)", values: lines.map((l) => Math.round(l.secondsPlayed / 60)) },
  ];
  const shooting: Series[] = [
    { name: "TS%", color: "var(--player-1)", values: lines.map((l) => (l.fga + l.fta > 0 ? Math.round((1000 * l.pts) / (2 * (l.fga + 0.44 * l.fta))) / 10 : null)) },
    { name: "FG%", color: "var(--player-2)", values: lines.map((l) => (l.fga > 0 ? Math.round((1000 * l.fgm) / l.fga) / 10 : null)) },
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Section title="Game by game" action={<Legend series={scoring} />}>
        <LineChart labels={labels} series={scoring} directLabels={false} label="Points, Game Score and minutes by game" />
      </Section>
      <Section title="Shooting by game" action={<Legend series={shooting} />}>
        <LineChart labels={labels} series={shooting} unit="%" max={100} directLabels={false} label="True shooting and field-goal percentage by game" />
      </Section>
    </div>
  );
}

function GameLog({ played, playerId }: { played: AnalysisGameData[]; playerId: string }) {
  return (
    <Section title="Game log">
      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap text-sm tabular-nums [&_td]:px-2 [&_th]:px-2">
          <thead className="text-xs text-muted">
            <tr className="text-right">
              <th className="text-left">Date</th>
              <th className="text-left">Opponent</th>
              <th>Result</th>
              <th>MIN</th>
              <th>PTS</th>
              <th>REB</th>
              <th>AST</th>
              <th>STL</th>
              <th>BLK</th>
              <th>TOV</th>
              <th>FG</th>
              <th>3P</th>
              <th>FT</th>
              <th>+/-</th>
            </tr>
          </thead>
          <tbody>
            {played.map((g) => {
              const l = g.box.players[playerId];
              const { us, opp } = g.box.score;
              return (
                <tr key={g.id} className="border-t border-line text-right">
                  <td className="py-1.5 text-left text-muted">{g.date ? new Date(g.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "–"}</td>
                  <td className="text-left">
                    <Link href={`/g/${g.id}`} className="font-bold hover:text-cyan hover:underline">
                      vs {g.opponent}
                    </Link>
                  </td>
                  <td>
                    <span className={us > opp ? "font-bold text-lime-strong" : us < opp ? "text-opp" : ""}>{us > opp ? "W" : us < opp ? "L" : "T"}</span> {us}–{opp}
                  </td>
                  <td>{Math.round(l.secondsPlayed / 60)}</td>
                  <td className="font-bold">{l.pts}</td>
                  <td>{l.reb}</td>
                  <td>{l.ast}</td>
                  <td>{l.stl}</td>
                  <td>{l.blk}</td>
                  <td>{l.tov}</td>
                  <td>
                    {l.fgm}/{l.fga}
                  </td>
                  <td>
                    {l.tpm}/{l.tpa}
                  </td>
                  <td>
                    {l.ftm}/{l.fta}
                  </td>
                  <td>{l.plusMinus > 0 ? `+${l.plusMinus}` : l.plusMinus}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
