"use client";

import { useEffect, useMemo, useState } from "react";
import { card } from "@/components/ui";
import type { AnalysisGame } from "@/lib/sports/basketball/advanced";
import { formatClock } from "@/lib/sports/basketball/clock";
import {
  analyzeGame,
  buildBaseline,
  lineupRows,
  liveRates,
  type Baseline,
  type CoachState,
  type PlayerRates,
  type TeamRates,
} from "@/lib/sports/basketball/coach";
import { alertHistory, coachAlerts, type AlertLevel, type CoachAlert, type CoachThresholds } from "@/lib/sports/basketball/coach-alerts";
import type { BasketballConfig, BasketballEvent } from "@/lib/sports/basketball/events";
import { periodLabel } from "@/lib/sports/basketball/period";
import { liveEvents, type Player } from "@/lib/sports/types";

export interface CoachViewProps {
  config: BasketballConfig;
  events: readonly BasketballEvent[];
  players: Player[];
  /** Previous final games, newest first (not including this one). */
  baselineGames: AnalysisGame[];
  thresholds: CoachThresholds;
  teamName: string;
  opponentName: string;
  /** "panel" = inside the scorer screen (smaller header, no staleness badge). */
  mode?: "page" | "panel";
  /** Game is over: show the review scrubber. */
  review?: boolean;
  live?: { connected: boolean; lastUpdate: number };
}

const fmt = (v: number | null | undefined, d = 0) => (v == null ? "–" : v.toFixed(d));
const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

const LEVEL_STYLE: Record<AlertLevel, string> = {
  high: "bg-opp-soft ring-1 ring-opp/60",
  warn: "bg-warn-soft ring-1 ring-warn/50",
  info: "bg-cyan-soft ring-1 ring-cyan/40",
};
const LEVEL_ICON: Record<AlertLevel, string> = { high: "‼", warn: "!", info: "i" };

export function CoachView(props: CoachViewProps) {
  const { config, players, baselineGames, thresholds, teamName, opponentName, mode = "page", review = false } = props;
  const all = useMemo(() => liveEvents(props.events), [props.events]);
  const [scrub, setScrub] = useState<number | null>(null);
  const [baseMode, setBaseMode] = useState<"season" | "last5">("season");
  const [dense, setDense] = useState(false);
  const cut = review && scrub !== null ? Math.min(scrub, all.length) : all.length;

  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const tag = useMemo(
    () => (id: string) => {
      const p = byId.get(id);
      return p ? `#${p.jersey ?? "–"} ${p.name}` : "Unknown";
    },
    [byId],
  );
  const short = (id: string) => {
    const p = byId.get(id);
    return p ? (p.jersey ? `#${p.jersey}` : p.name.split(" ")[0]) : "?";
  };

  const opponentStats = Boolean(config.opponentStats);
  const state = useMemo(() => analyzeGame(all.slice(0, cut), config), [all, cut, config]);
  const baseline = useMemo<Baseline | null>(
    () => (baselineGames.length ? buildBaseline(baselineGames, baseMode === "last5" ? 5 : undefined) : null),
    [baselineGames, baseMode],
  );
  const now = useMemo(() => liveRates(state.box, opponentStats), [state.box, opponentStats]);
  const alerts = coachAlerts(state, config, thresholds, baseline, tag);
  const history = useMemo(
    () =>
      alertHistory(
        cut,
        (i) => analyzeGame(all.slice(0, i), config),
        (s) => coachAlerts(s, config, thresholds, baseline, tag),
      ),
    // Replaying is O(plays²); only redo it when the play count or settings change.
    [all, cut, config, thresholds, baseline, tag],
  );

  if (all.length === 0) {
    return <p className="rounded-2xl border-2 border-dashed border-line p-8 text-center text-muted">The coach view fills in once the game starts.</p>;
  }

  return (
    <div className="space-y-4">
      {/* Header: score, time, controls */}
      <section className={`${card} flex flex-wrap items-center justify-between gap-3 p-4`}>
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-black tabular-nums">
            <span className="text-lime-strong">{state.box.score.us}</span>
            <span className="text-muted"> – </span>
            {state.box.score.opp}
          </span>
          <span className="text-sm text-muted">
            {state.period ? periodLabel(config, state.period) : "Pre-game"} · {state.inPeriod ? formatClock(state.clockMs) : "Break"}
            {mode === "page" && ` · ${teamName} vs ${opponentName}`}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {props.live && !review && <StaleBadge {...props.live} />}
          <Toggle
            value={baseMode}
            options={[
              ["season", "vs season"],
              ["last5", "vs last 5"],
            ]}
            onChange={setBaseMode}
          />
          <button
            onClick={() => setDense((d) => !d)}
            className={`rounded-full px-3 py-1 font-bold ring-1 ${dense ? "bg-brand text-brand-fg ring-brand" : "ring-line"}`}
          >
            {dense ? "Less detail" : "More detail"}
          </button>
        </div>
      </section>

      {review && (
        <section className={`${card} p-4`}>
          <label className="flex flex-col gap-2 text-sm">
            <span className="font-bold">
              Replay: play {cut} of {all.length}
              {state.period > 0 && ` · ${periodLabel(config, state.period)} ${formatClock(state.clockMs)}`}
            </span>
            <input
              type="range"
              min={1}
              max={all.length}
              value={cut}
              onChange={(e) => setScrub(Number(e.target.value))}
              className="w-full accent-[var(--brand)]"
              aria-label="Replay the game up to this play"
            />
          </label>
        </section>
      )}

      <div className={mode === "panel" ? "grid gap-4" : "grid gap-4 lg:grid-cols-2"}>
        <Alerts alerts={alerts} history={history} cut={cut} config={config} review={review} onJump={review ? setScrub : undefined} />
        <Floor state={state} now={now} baseline={baseline} thresholds={thresholds} tag={tag} dense={dense} />
        <Momentum state={state} config={config} opponentName={opponentName} opponentStats={opponentStats} />
        <Lineups state={state} opponentStats={opponentStats} short={short} dense={dense} />
        <TeamCompare now={now.team} base={baseline?.team ?? null} games={baseline?.team.games ?? 0} opponentStats={opponentStats} />
        {dense && <PlayerCompare state={state} now={now.players} base={baseline?.players ?? null} tag={tag} />}
      </div>
      {!opponentStats && (
        <p className="text-xs text-muted">
          This game was scored without opponent misses, rebounds and turnovers, so ratings, pace and opponent points per possession are hidden.
        </p>
      )}
    </div>
  );
}

function Toggle<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <span className="inline-flex rounded-full p-0.5 ring-1 ring-line">
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} className={`rounded-full px-3 py-1 font-bold ${value === v ? "bg-brand text-brand-fg" : "text-muted"}`}>
          {l}
        </button>
      ))}
    </span>
  );
}

/** Live: green. Disconnected: amber after 30 s without an update, red after 90 s. */
export function StaleBadge({ connected, lastUpdate }: { connected: boolean; lastUpdate: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  const age = Math.max(0, Math.round((now - lastUpdate) / 1000));
  const tone = connected ? "bg-lime-soft ring-lime/50" : age > 90 ? "bg-opp-soft ring-opp/60" : age > 30 ? "bg-warn-soft ring-warn/50" : "bg-card-2 ring-line";
  return (
    <span className={`rounded-full px-3 py-1 font-bold ring-1 ${tone}`} role="status">
      {connected ? "● Live" : `Offline · last update ${age < 60 ? `${age}s` : mmss(age)} ago`}
    </span>
  );
}

function Panel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`${card} min-w-0 p-4 ${className}`}>
      <h2 className="mb-3 text-sm font-black uppercase tracking-widest text-muted">{title}</h2>
      {children}
    </section>
  );
}

function Alerts({
  alerts,
  history,
  cut,
  config,
  review,
  onJump,
}: {
  alerts: CoachAlert[];
  history: ReturnType<typeof alertHistory>;
  cut: number;
  config: BasketballConfig;
  review: boolean;
  onJump?: (i: number) => void;
}) {
  const past = history.filter((h) => !h.active);
  return (
    <Panel title={`Alerts (${alerts.length})`} className="lg:col-span-2">
      {alerts.length === 0 ? (
        <p className="text-sm text-muted">Nothing needs attention right now.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {alerts.map((a) => (
            <li key={a.id} className={`flex gap-2 rounded-xl px-3 py-2 text-sm ${LEVEL_STYLE[a.level]}`}>
              <span className="font-black" aria-hidden>
                {LEVEL_ICON[a.level]}
              </span>
              <span>{a.text}</span>
            </li>
          ))}
        </ul>
      )}
      {past.length > 0 && (
        <details className="mt-3 text-sm" open={review}>
          <summary className="cursor-pointer text-muted">Earlier alerts ({past.length})</summary>
          <ul className="mt-2 space-y-1">
            {past.map((h) => (
              <li key={h.id} className="flex gap-2">
                <button
                  disabled={!onJump}
                  onClick={() => onJump?.(h.firstAt)}
                  className="w-20 shrink-0 text-left text-xs tabular-nums text-muted enabled:underline"
                >
                  {periodLabel(config, h.period)} {formatClock(h.clockMs)}
                </button>
                <span className={h.firstAt > cut ? "opacity-50" : ""}>{h.text}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Panel>
  );
}

function Delta({ now, base, digits = 0, good = "up" }: { now: number | null; base: number | null | undefined; digits?: number; good?: "up" | "down" }) {
  if (now == null || base == null) return null;
  const d = now - base;
  if (Math.abs(d) < Math.pow(10, -digits) / 2) return <span className="ml-1 text-xs text-muted">=</span>;
  const better = good === "up" ? d > 0 : d < 0;
  return (
    <span className={`ml-1 text-xs font-bold ${better ? "text-lime-strong" : "text-opp"}`}>
      {d > 0 ? "▲" : "▼"}
      {Math.abs(d).toFixed(digits)}
    </span>
  );
}

function Floor({
  state,
  now,
  baseline,
  thresholds,
  tag,
  dense,
}: {
  state: CoachState;
  now: Baseline;
  baseline: Baseline | null;
  thresholds: CoachThresholds;
  tag: (id: string) => string;
  dense: boolean;
}) {
  const on = new Set(state.box.onCourt);
  const rows = Object.entries(state.box.players).sort(
    ([a, la], [b, lb]) => Number(on.has(b)) - Number(on.has(a)) || lb.secondsPlayed - la.secondsPlayed,
  );
  const foulTone = (pf: number) =>
    pf >= thresholds.foulOut ? "text-muted line-through" : pf === thresholds.foulOut - 1 ? "font-black text-opp" : pf >= 3 ? "font-bold text-warn" : "";
  return (
    <Panel title="Players: fouls, minutes, shooting" className="lg:col-span-2">
      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap text-sm tabular-nums [&_td]:px-1.5 [&_th]:px-1.5 [&_td:first-child]:pl-0 [&_th:first-child]:pl-0">
          <thead className="text-xs text-muted">
            <tr className="text-right">
              <th className="py-1 text-left">Player</th>
              <th>PF</th>
              <th>MIN</th>
              <th title="Time on court since last sub">Stint</th>
              <th>PTS</th>
              <th>FG</th>
              <th title="True shooting % today, ▲▼ vs normal">TS%</th>
              <th>+/-</th>
              {dense && (
                <>
                  <th>REB</th>
                  <th>AST</th>
                  <th>TOV</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map(([id, l]) => {
              const stint = state.stintSec[id];
              const live = now.players[id];
              const enough = l.fga + l.fta >= thresholds.minShots;
              return (
                <tr key={id} className={`border-t border-line text-right ${on.has(id) ? "" : "text-muted"}`}>
                  <td className="py-1.5 text-left">
                    {on.has(id) && <span className="mr-1 text-lime-strong">●</span>}
                    {tag(id)}
                  </td>
                  <td className={foulTone(l.pf)}>{l.pf}</td>
                  <td>{mmss(l.secondsPlayed)}</td>
                  <td className={stint != null && stint >= thresholds.stintMin * 60 ? "font-bold text-warn" : ""}>{stint != null ? mmss(stint) : "–"}</td>
                  <td className="font-bold">{l.pts}</td>
                  <td>
                    {l.fgm}/{l.fga}
                  </td>
                  <td>
                    {fmt(live?.tsPct)}
                    {enough && <Delta now={live?.tsPct ?? null} base={baseline?.players[id]?.tsPct} />}
                  </td>
                  <td>{l.plusMinus > 0 ? `+${l.plusMinus}` : l.plusMinus}</td>
                  {dense && (
                    <>
                      <td>{l.reb}</td>
                      <td>{l.ast}</td>
                      <td>{l.tov}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        Team fouls this period: us {state.teamFouls.us}, them {state.teamFouls.opp} (penalty after {thresholds.penaltyAfter}).
      </p>
    </Panel>
  );
}

function Momentum({ state, config, opponentName, opponentStats }: { state: CoachState; config: BasketballConfig; opponentName: string; opponentStats: boolean }) {
  const run = state.currentRun;
  const who = (side: "us" | "opp") => (side === "us" ? "Us" : opponentName);
  return (
    <Panel title="Runs & momentum">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Stat label="Current run" value={run ? `${who(run.side)} ${run.points}-0` : "–"} tone={run?.side === "opp" ? "text-opp" : "text-lime-strong"} />
        <Stat label="Since we scored" value={state.sinceScore.us == null ? "–" : mmss(state.sinceScore.us)} />
        <Stat label="Our best run" value={state.biggestRun.us ? `${state.biggestRun.us.points}-0` : "–"} />
        <Stat label="Their best run" value={state.biggestRun.opp ? `${state.biggestRun.opp.points}-0` : "–"} />
      </div>
      <table className="mt-3 w-full text-sm tabular-nums">
        <thead className="text-xs text-muted">
          <tr className="text-right">
            <th className="text-left">Period</th>
            <th>Us</th>
            <th>Them</th>
            <th title="Points per possession">Our PPP</th>
            {opponentStats && <th>Their PPP</th>}
          </tr>
        </thead>
        <tbody>
          {state.periods.map((p) => (
            <tr key={p.period} className="border-t border-line text-right">
              <td className="py-1 text-left">{periodLabel(config, p.period)}</td>
              <td>{p.points.us}</td>
              <td>{p.points.opp}</td>
              <td>{fmt(p.ppp.us, 2)}</td>
              {opponentStats && <td>{fmt(p.ppp.opp, 2)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function Stat({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-card-2 px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-xl font-black tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

function Lineups({ state, opponentStats, short, dense }: { state: CoachState; opponentStats: boolean; short: (id: string) => string; dense: boolean }) {
  const rows = lineupRows(state, opponentStats).slice(0, dense ? 12 : 5);
  return (
    <Panel title="Lineups today">
      <table className="w-full whitespace-nowrap text-sm tabular-nums [&_td]:px-1.5 [&_th]:px-1.5 [&_td:first-child]:pl-0 [&_th:first-child]:pl-0">
        <thead className="text-xs text-muted">
          <tr className="text-right">
            <th className="text-left">Five</th>
            <th>MIN</th>
            <th>+/-</th>
            {opponentStats && <th title="Net rating per 100 possessions">Net</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={`border-t border-line text-right ${r.current ? "font-bold" : ""}`}>
              <td className="py-1 text-left">
                {r.current && <span className="mr-1 text-lime-strong">●</span>}
                {r.players.map(short).join(" ")}
              </td>
              <td>{r.minutes.toFixed(1)}</td>
              <td className={r.plusMinus < 0 ? "text-opp" : r.plusMinus > 0 ? "text-lime-strong" : ""}>
                {r.plusMinus > 0 ? `+${r.plusMinus}` : r.plusMinus}
              </td>
              {opponentStats && <td>{fmt(r.net)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

const TEAM_ROWS: { key: keyof TeamRates; label: string; good: "up" | "down"; digits?: number; poss?: boolean }[] = [
  { key: "ptsPer32", label: "Points per 32 min", good: "up" },
  { key: "efgPct", label: "eFG%", good: "up" },
  { key: "tsPct", label: "TS%", good: "up" },
  { key: "threePaRate", label: "3PA rate", good: "up" },
  { key: "ftRate", label: "FT rate", good: "up" },
  { key: "tovPct", label: "Turnover %", good: "down" },
  { key: "orebPct", label: "Off. rebound %", good: "up", poss: true },
  { key: "pace", label: "Pace (poss / 32)", good: "up", poss: true },
  { key: "ortg", label: "Off. rating", good: "up", poss: true },
  { key: "drtg", label: "Def. rating", good: "down", poss: true },
];

function TeamCompare({ now, base, games, opponentStats }: { now: TeamRates; base: TeamRates | null; games: number; opponentStats: boolean }) {
  return (
    <Panel title={base ? `Team today vs previous ${games} games` : "Team today"}>
      <table className="w-full whitespace-nowrap text-sm tabular-nums [&_td]:px-1.5 [&_th]:px-1.5 [&_td:first-child]:pl-0 [&_th:first-child]:pl-0">
        <thead className="text-xs text-muted">
          <tr className="text-right">
            <th className="text-left">Stat</th>
            <th>Today</th>
            {base && <th>Normal</th>}
          </tr>
        </thead>
        <tbody>
          {TEAM_ROWS.filter((r) => opponentStats || !r.poss).map((r) => (
            <tr key={r.key} className="border-t border-line text-right">
              <td className="py-1 text-left">{r.label}</td>
              <td className="font-bold">
                {fmt(now[r.key] as number | null, r.digits)}
                <Delta now={now[r.key] as number | null} base={base?.[r.key] as number | null} good={r.good} />
              </td>
              {base && <td className="text-muted">{fmt(base[r.key] as number | null, r.digits)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {!base && <p className="mt-2 text-xs text-muted">Comparisons appear after the first finished game.</p>}
    </Panel>
  );
}

function PlayerCompare({
  state,
  now,
  base,
  tag,
}: {
  state: CoachState;
  now: Record<string, PlayerRates>;
  base: Record<string, PlayerRates> | null;
  tag: (id: string) => string;
}) {
  const ids = Object.keys(state.box.players).filter((id) => state.box.players[id].secondsPlayed > 0);
  const cols: { key: keyof PlayerRates; label: string; good: "up" | "down" }[] = [
    { key: "ptsPer32", label: "PTS/32", good: "up" },
    { key: "rebPer32", label: "REB/32", good: "up" },
    { key: "astPer32", label: "AST/32", good: "up" },
    { key: "tovPer32", label: "TOV/32", good: "down" },
    { key: "usgPct", label: "USG%", good: "up" },
  ];
  return (
    <Panel title="Players today vs normal (per 32 min)">
      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap text-sm tabular-nums [&_td]:px-1.5 [&_th]:px-1.5 [&_td:first-child]:pl-0 [&_th:first-child]:pl-0">
          <thead className="text-xs text-muted">
            <tr className="text-right">
              <th className="text-left">Player</th>
              {cols.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ids.map((id) => (
              <tr key={id} className="border-t border-line text-right">
                <td className="py-1 text-left">{tag(id)}</td>
                {cols.map((c) => (
                  <td key={c.key}>
                    {fmt(now[id]?.[c.key] as number | null)}
                    <Delta now={now[id]?.[c.key] as number | null} base={base?.[id]?.[c.key] as number | null} good={c.good} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">Per-32 rates swing a lot over a few minutes; read them as hints, not verdicts.</p>
    </Panel>
  );
}
