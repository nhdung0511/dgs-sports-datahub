"use client";

import { useEffect, useMemo, useState } from "react";
import { input, label } from "@/components/ui";
import { defaultMinMinutes, seasonOf, UNIT_LABELS, type Unit } from "@/lib/sports/basketball/advanced";
import type { Player } from "@/lib/sports/types";
import { IndexView } from "./index-view";
import { PlotView } from "./plot-view";
import { RadarView } from "./radar-view";
import { archetypeRating, detectArchetype, type Archetype } from "@/lib/sports/basketball/archetypes";
import { METRICS } from "@/lib/sports/basketball/metrics";
import {
  buildRows,
  metricPercentiles,
  shortName,
  toAnalysisGames,
  type AnalysisGameData,
  type RoleInfo,
  type ViewProps,
} from "./shared";
import { TeamView } from "./team-view";

const VIEWS = [
  { key: "index", label: "Leaderboard" },
  { key: "radar", label: "Radars" },
  { key: "plot", label: "Scatter plot" },
  { key: "team", label: "Team trends" },
] as const;
type View = (typeof VIEWS)[number]["key"];

type ResultFilter = "all" | "W" | "L";

const resultOf = (g: AnalysisGameData) =>
  g.box.score.us > g.box.score.opp ? "W" : g.box.score.us < g.box.score.opp ? "L" : "T";

export function AnalysisApp({
  players,
  games,
  archetypes,
  assignments,
  benchmarks,
}: {
  players: Player[];
  games: AnalysisGameData[];
  archetypes: Archetype[];
  assignments: Record<string, string>;
  benchmarks: Record<string, number>;
}) {
  const [roleSource, setRoleSource] = useState<"assigned" | "auto">("assigned");
  const [view, setView] = useState<View>("index");
  const seasons = useMemo(() => [...new Set(games.map((g) => seasonOf(g.date)))].sort().reverse(), [games]);
  const [season, setSeason] = useState<string>(seasons[0] ?? "all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [result, setResult] = useState<ResultFilter>("all");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [unit, setUnit] = useState<Unit>("per32");
  const [minOverride, setMinOverride] = useState<number | null>(null);

  // Keep the chosen tab in the URL (?view=radar) so a link opens the same view.
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("view");
    if (VIEWS.some((x) => x.key === v)) setView(v as View);
  }, []);
  function pickView(v: View) {
    setView(v);
    const url = new URL(window.location.href);
    url.searchParams.set("view", v);
    window.history.replaceState(null, "", url);
  }

  // Games in the chosen season/date range, before the per-game picks.
  const inRange = useMemo(
    () =>
      games.filter((g) => {
        if (season !== "all" && seasonOf(g.date) !== season) return false;
        const day = g.date?.slice(0, 10) ?? "";
        if (from && day < from) return false;
        if (to && day > to) return false;
        if (result !== "all" && resultOf(g) !== result) return false;
        return true;
      }),
    [games, season, from, to, result],
  );
  const selected = useMemo(() => inRange.filter((g) => !excluded.has(g.id)), [inRange, excluded]);

  const autoMin = useMemo(() => defaultMinMinutes(toAnalysisGames(selected)), [selected]);
  const minMinutes = minOverride ?? autoMin;
  const maxMinutes = Math.max(1, Math.round(selected.reduce((s, g) => s + Object.values(g.box.lineups).reduce((a, l) => a + l.seconds, 0), 0) / 60));

  const rows = useMemo(() => buildRows(players, selected, minMinutes), [players, selected, minMinutes]);
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const nameOf = (id: string) => {
    const p = byId.get(id);
    return p ? shortName(p) : "?";
  };
  const fullGames = selected.filter((g) => g.opponentStats).length;

  // Team percentiles for every metric, computed once and shared by all views.
  const pcts = useMemo(
    () => Object.fromEntries(METRICS.map((m) => [m.key, metricPercentiles(rows, m, unit, minMinutes)])),
    [rows, unit, minMinutes],
  );

  // Each player's archetype: the coach's pick (in "assigned" mode), else the best fit from their stats.
  const roles = useMemo(() => {
    const out: Record<string, RoleInfo> = {};
    for (const r of rows) {
      const pctOf = (key: string) => pcts[key]?.[r.player.id] ?? null;
      const assigned = archetypes.find((a) => a.id === assignments[r.player.id]);
      if (roleSource === "assigned" && assigned) {
        out[r.player.id] = { archetype: assigned, rating: archetypeRating(assigned, pctOf), source: "assigned" };
      } else {
        const best = detectArchetype(archetypes, pctOf);
        out[r.player.id] = best
          ? { archetype: best.archetype, rating: best.rating, source: "auto" }
          : { archetype: null, rating: null, source: null };
      }
    }
    return out;
  }, [rows, pcts, archetypes, assignments, roleSource]);

  const props: ViewProps = {
    rows,
    games: selected,
    unit,
    minMinutes,
    nameOf,
    pcts,
    roles,
    archetypes,
    benchmarks,
  };

  return (
    <div>
      {/* Sub-tabs */}
      <div role="tablist" aria-label="Analysis views" className="mb-5 flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            role="tab"
            aria-selected={view === v.key}
            onClick={() => pickView(v.key)}
            className={`rounded-full px-4 py-2 text-sm font-bold transition ${
              view === v.key ? "bg-brand text-brand-fg" : "border border-line bg-card hover:border-muted"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Filters: one row above every chart */}
      <div className="mb-3 grid gap-3 rounded-2xl border border-line bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="f-season" className={label}>
            Season
          </label>
          <select id="f-season" value={season} onChange={(e) => setSeason(e.target.value)} className={input}>
            {seasons.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            <option value="all">All seasons</option>
          </select>
        </div>
        <div>
          <label htmlFor="f-from" className={label}>
            From
          </label>
          <input id="f-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={input} />
        </div>
        <div>
          <label htmlFor="f-to" className={label}>
            To
          </label>
          <input id="f-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className={input} />
        </div>
        <div>
          <label htmlFor="f-result" className={label}>
            Results
          </label>
          <select id="f-result" value={result} onChange={(e) => setResult(e.target.value as ResultFilter)} className={input}>
            <option value="all">All games</option>
            <option value="W">Wins only</option>
            <option value="L">Losses only</option>
          </select>
        </div>
        <div>
          <label htmlFor="f-unit" className={label}>
            Stats shown
          </label>
          <select id="f-unit" value={unit} onChange={(e) => setUnit(e.target.value as Unit)} className={input}>
            {(Object.keys(UNIT_LABELS) as Unit[]).map((u) => (
              <option key={u} value={u}>
                {UNIT_LABELS[u]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-role" className={label}>
            Archetypes
          </label>
          <select
            id="f-role"
            value={roleSource}
            onChange={(e) => setRoleSource(e.target.value as "assigned" | "auto")}
            className={input}
          >
            <option value="assigned">Coach-assigned</option>
            <option value="auto">Auto-detected</option>
          </select>
        </div>
        <div>
          <label htmlFor="f-min" className={label}>
            Min. minutes: {minMinutes}
          </label>
          <input
            id="f-min"
            type="range"
            min={0}
            max={maxMinutes}
            value={Math.min(minMinutes, maxMinutes)}
            onChange={(e) => setMinOverride(Number(e.target.value))}
            className="mt-3 w-full accent-[var(--brand)]"
          />
          {minOverride !== null && (
            <button onClick={() => setMinOverride(null)} className="text-xs text-cyan underline">
              Reset to {autoMin} (20%)
            </button>
          )}
        </div>
      </div>

      {/* Per-game picks (opponent / game filter) */}
      <details className="mb-3 rounded-2xl border border-line bg-card px-4 py-3">
        <summary className="cursor-pointer text-sm font-bold">
          Games: {selected.length} of {inRange.length} selected
          <span className="font-normal text-muted"> · {fullGames} with opponent stats</span>
        </summary>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <button onClick={() => setExcluded(new Set())} className="text-cyan underline">
            Select all
          </button>
          <button onClick={() => setExcluded(new Set(inRange.map((g) => g.id)))} className="text-cyan underline">
            Clear
          </button>
        </div>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {inRange.map((g) => (
            <li key={g.id}>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!excluded.has(g.id)}
                  onChange={() =>
                    setExcluded((cur) => {
                      const next = new Set(cur);
                      if (next.has(g.id)) next.delete(g.id);
                      else next.add(g.id);
                      return next;
                    })
                  }
                />
                <span>
                  {resultOf(g)} vs {g.opponent} {g.box.score.us}–{g.box.score.opp}
                  <span className="text-muted"> · {g.date ? new Date(g.date).toLocaleDateString() : "no date"}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </details>

      <p className="mb-5 text-xs text-muted">
        {selected.length} games · {UNIT_LABELS[unit].toLowerCase()} · players under {minMinutes} min are greyed out and
        left out of percentiles. Possession-based stats (ratings, rebound/steal/block %, per 100) use the {fullGames} games
        with opponent stats.
      </p>

      {selected.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-line p-8 text-center text-muted">
          No games match these filters.
        </p>
      ) : view === "index" ? (
        <IndexView {...props} />
      ) : view === "radar" ? (
        <RadarView {...props} />
      ) : view === "plot" ? (
        <PlotView {...props} />
      ) : (
        <TeamView {...props} />
      )}
    </div>
  );
}
