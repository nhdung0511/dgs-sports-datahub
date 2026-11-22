"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BoxTable } from "@/components/box-table";
import { CoachView } from "@/components/coach-view";
import { ThemeToggle } from "@/components/theme-toggle";
import { clockNow, formatClock, parseClock } from "@/lib/sports/basketball/clock";
import { describeEvent } from "@/lib/sports/basketball/describe";
import type {
  BasketballConfig,
  BasketballEvent,
  BasketballEventType,
  BasketballPayloads,
} from "@/lib/sports/basketball/events";
import { periodLabel } from "@/lib/sports/basketball/period";
import { emptyLine } from "@/lib/sports/basketball/stats";
import type { AnalysisGame } from "@/lib/sports/basketball/advanced";
import { mergeThresholds } from "@/lib/sports/basketball/coach-alerts";
import { liveEvents, type Game, type GameEvent, type Player } from "@/lib/sports/types";
import { useScorer, type SyncStatus } from "./use-scorer";

interface Props {
  game: Game<BasketballConfig>;
  players: Player[];
  initialEvents: GameEvent[];
  /** Set for coaches/admins: adds a Coach tab that works offline from this device's events. */
  coach?: { baselineGames: AnalysisGame[]; overrides: Record<string, number>; teamName: string };
}

type PlayerAction = {
  [K in BasketballEventType]: {
    key: string;
    label: string;
    sub?: string;
    type: K;
    payload: BasketballPayloads[K];
    tone: "made" | "miss" | "stat" | "bad";
  };
}[BasketballEventType];

const SHOTS: PlayerAction[] = [
  { key: "q", label: "2 PT", sub: "Made", type: "shot", payload: { points: 2, made: true }, tone: "made" },
  { key: "e", label: "3 PT", sub: "Made", type: "shot", payload: { points: 3, made: true }, tone: "made" },
  { key: "t", label: "Free throw", sub: "Made", type: "shot", payload: { points: 1, made: true }, tone: "made" },
  { key: "w", label: "2 PT", sub: "Missed", type: "shot", payload: { points: 2, made: false }, tone: "miss" },
  { key: "r", label: "3 PT", sub: "Missed", type: "shot", payload: { points: 3, made: false }, tone: "miss" },
  { key: "y", label: "Free throw", sub: "Missed", type: "shot", payload: { points: 1, made: false }, tone: "miss" },
];

const OTHER: PlayerAction[] = [
  { key: "o", label: "Off. rebound", type: "rebound", payload: { offensive: true }, tone: "stat" },
  { key: "d", label: "Def. rebound", type: "rebound", payload: { offensive: false }, tone: "stat" },
  { key: "a", label: "Assist", type: "assist", payload: {}, tone: "stat" },
  { key: "s", label: "Steal", type: "steal", payload: {}, tone: "stat" },
  { key: "b", label: "Block", type: "block", payload: {}, tone: "stat" },
  { key: "x", label: "Turnover", type: "turnover", payload: {}, tone: "bad" },
  { key: "f", label: "Foul", type: "foul", payload: {}, tone: "bad" },
];

const PLAYER_ACTIONS = [...SHOTS, ...OTHER];
const OPP_KEYS: Record<string, 1 | 2 | 3> = { j: 1, k: 2, l: 3 };

/** Opponent team-level stats (no opponent players): misses, rebounds, turnovers, fouls. */
interface OppAction {
  key: string;
  label: string;
  type: BasketballEventType;
  payload: object;
}
const OPP_MISSES: OppAction[] = [
  { key: "m", label: "FT miss", type: "shot", payload: { points: 1, made: false } },
  { key: ",", label: "2 miss", type: "shot", payload: { points: 2, made: false } },
  { key: ".", label: "3 miss", type: "shot", payload: { points: 3, made: false } },
];
const OPP_OTHER: OppAction[] = [
  { key: "g", label: "Off. reb", type: "rebound", payload: { offensive: true } },
  { key: "h", label: "Def. reb", type: "rebound", payload: { offensive: false } },
  { key: "v", label: "Turnover", type: "turnover", payload: {} },
  { key: "p", label: "Foul", type: "foul", payload: {} },
];
const OPP_ACTIONS = [...OPP_MISSES, ...OPP_OTHER];

const toneClass: Record<PlayerAction["tone"], string> = {
  made: "bg-brand text-brand-fg hover:bg-brand-hover shadow-sm",
  miss: "border-2 border-line bg-card text-fg hover:border-muted",
  stat: "bg-cyan-soft text-fg ring-1 ring-inset ring-cyan/40 hover:ring-cyan",
  bad: "bg-warn-soft text-fg ring-1 ring-inset ring-warn/50 hover:ring-warn",
};

function Kbd({ k }: { k: string }) {
  return (
    <span className="ml-1.5 hidden rounded border border-current/25 px-1 text-[10px] font-medium opacity-60 lg:inline">
      {k}
    </span>
  );
}

function SyncBadge({ sync }: { sync: SyncStatus }) {
  const map = {
    synced: ["All plays saved", "bg-lime-soft text-fg"],
    pending: [`Saving ${"count" in sync ? sync.count : 0}…`, "bg-cyan-soft text-fg"],
    error: [`Offline: ${"count" in sync ? sync.count : 0} plays kept on this device`, "bg-warn-soft text-fg"],
  } as const;
  const [text, cls] = map[sync.kind];
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-medium ${cls}`}
      title={sync.kind === "error" ? sync.message : undefined}
    >
      {text}
    </span>
  );
}

export function Scorer({ game, players, initialEvents, coach }: Props) {
  const router = useRouter();
  const s = useScorer({
    gameId: game.id,
    config: game.config,
    initialEvents,
    initialStatus: game.status,
  });
  const [copied, setCopied] = useState(false);

  async function shareLink() {
    const url = `${window.location.origin}/g/${game.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link for fans:", url);
    }
  }

  async function finishGame() {
    const { us, opp } = s.box.score;
    if (!window.confirm(`Finish the game at ${us}–${opp}? It will be marked final and added to season stats.`)) return;
    if (s.inPeriod) s.endPeriod();
    try {
      await s.flush();
      await s.setStatus("final");
      router.push(`/g/${game.id}`);
    } catch (err) {
      window.alert(`Couldn't finish the game. Check your connection and try again.\n\n${err instanceof Error ? err.message : ""}`);
    }
  }
  const [selected, setSelected] = useState<string | null>(null);
  const [lineupDraft, setLineupDraft] = useState<string[] | null>(null);
  const [tab, setTab] = useState<"log" | "box" | "coach">("log");
  const thresholds = useMemo(() => mergeThresholds(game.config, coach?.overrides), [game.config, coach?.overrides]);
  const [toast, setToast] = useState<{ id: string; text: string } | null>(null);
  const [, setTick] = useState(0);

  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const nameOf = (id: string) => byId.get(id)?.name ?? "Unknown";
  const tag = (id: string) => {
    const p = byId.get(id);
    return p ? `#${p.jersey ?? "–"} ${p.name}` : "Unknown";
  };

  // Re-render while the clock runs.
  useEffect(() => {
    if (!s.clock.running) return;
    const i = setInterval(() => setTick((t) => t + 1), 100);
    return () => clearInterval(i);
  }, [s.clock.running]);

  // Confirmation toast fades after a few seconds.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const remaining = clockNow(s.clock, Date.now());
  const onCourt = s.box.onCourt.filter((id) => byId.has(id));
  const defaultLineup = onCourt.length ? onCourt : players.slice(0, 5).map((p) => p.id);
  const lineup = lineupDraft ?? defaultLineup;
  const bench = players.filter((p) => !(s.inPeriod ? onCourt : lineup).includes(p.id));
  const courtPlayers = s.inPeriod ? onCourt : lineup;
  const nextPeriod = s.period + 1;
  const regulationOver = s.period >= game.config.periodCount && !s.inPeriod;
  const curPeriod = Math.max(1, s.period);
  const fouls = {
    us: s.box.foulsByPeriod.us[curPeriod - 1] ?? 0,
    opp: s.box.foulsByPeriod.opp[curPeriod - 1] ?? 0,
  };

  function announce(ev: BasketballEvent) {
    const who = ev.side === "opp" ? game.opponentName : ev.playerId ? tag(ev.playerId) : "";
    setToast({ id: ev.id, text: `${describeEvent(ev, game.config, nameOf)}${who ? ` · ${who}` : ""}` });
  }

  function playerAction(a: PlayerAction) {
    if (!s.inPeriod || !selected) return;
    announce(s.record(a.type, a.payload as never, { playerId: selected }));
    setSelected(null);
  }

  function oppScore(points: 1 | 2 | 3) {
    if (!s.inPeriod) return;
    announce(s.record("shot", { points, made: true }, { side: "opp" }));
  }

  function oppAction(a: OppAction) {
    if (!s.inPeriod) return;
    announce(s.record(a.type, a.payload as never, { side: "opp" }));
  }

  function tapCourt(id: string) {
    if (!s.inPeriod) return toggleLineup(id);
    setSelected((cur) => (cur === id ? null : id));
  }

  function tapBench(id: string) {
    if (!s.inPeriod) return toggleLineup(id);
    if (!selected) return;
    announce(s.record("sub", { playerIn: id, playerOut: selected }));
    setSelected(null);
  }

  function toggleLineup(id: string) {
    const cur = lineup;
    if (cur.includes(id)) setLineupDraft(cur.filter((x) => x !== id));
    else if (cur.length < 5) setLineupDraft([...cur, id]);
  }

  function startPeriod() {
    if (lineup.length === 0) return;
    s.startPeriod(lineup);
    setLineupDraft(null);
  }

  function editClock() {
    const input = window.prompt("Set the game clock (for example 7:05 or 42.3)", formatClock(remaining));
    if (input === null) return;
    const ms = parseClock(input);
    if (ms !== null) s.setClockMs(ms);
  }

  // Keyboard shortcuts for laptop scorekeeping.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.closest("input, select, textarea")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        s.undo();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === " ") {
        e.preventDefault();
        if (s.inPeriod) s.toggleClock();
      } else if (k === "escape") setSelected(null);
      else if (/^[1-5]$/.test(k) && s.inPeriod) {
        const id = onCourt[Number(k) - 1];
        if (id) setSelected((cur) => (cur === id ? null : id));
      } else if (k in OPP_KEYS) oppScore(OPP_KEYS[k]);
      else if (OPP_ACTIONS.some((x) => x.key === k)) oppAction(OPP_ACTIONS.find((x) => x.key === k)!);
      else {
        const a = PLAYER_ACTIONS.find((x) => x.key === k);
        if (a) playerAction(a);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const log = liveEvents(s.events).slice().reverse();
  const disabled = !s.inPeriod;
  const canAct = s.inPeriod && Boolean(selected);

  if (!s.loaded) {
    return <main className="p-6 text-muted">Loading game…</main>;
  }

  // What the scorekeeper should do next, in plain words.
  const guide = !s.inPeriod
    ? s.period === 0
      ? { step: "Before tip-off", text: `Tap players to choose your starting five (${lineup.length}/5), then press Start ${periodLabel(game.config, 1)}.` }
      : regulationOver && s.box.score.us !== s.box.score.opp
        ? { step: "Game over", text: "Regulation is finished. Press Finish game to save the final score." }
        : { step: "Break", text: `Change the lineup if needed, then press Start ${periodLabel(game.config, nextPeriod)}.` }
    : selected
      ? { step: "Step 2", text: `What did ${tag(selected)} do? Pick an action, or tap a bench player to sub them out.` }
      : { step: "Step 1", text: "Tap the player on court who made the play." };

  return (
    <main className="flex min-h-screen flex-col bg-bg text-fg lg:h-screen">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-line bg-card px-4 py-2">
        <Link href="/games" className="text-sm font-medium text-muted hover:text-fg">
          ← Games
        </Link>
        <span className="hidden text-sm font-bold sm:inline">
          <span className="text-lime">DGS</span> sports datahub
        </span>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <SyncBadge sync={s.sync} />
          <button
            onClick={shareLink}
            className="rounded-full border border-line px-3 py-1.5 text-sm font-medium hover:border-cyan"
            title="Copy the public link fans can follow"
          >
            {copied ? "✓ Link copied" : "Share live link"}
          </button>
          {s.period > 0 && s.status !== "final" && (
            <button
              onClick={finishGame}
              className={`rounded-full px-3 py-1.5 text-sm font-bold ${
                regulationOver && s.box.score.us !== s.box.score.opp
                  ? "bg-lime-strong text-black"
                  : "border border-line hover:border-muted"
              }`}
            >
              Finish game
            </button>
          )}
          <ThemeToggle />
        </div>
      </div>

      {/* Scoreboard */}
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-line bg-brand px-4 py-3 text-brand-fg">
        <div className="text-right">
          <div className="text-xs font-bold uppercase tracking-widest opacity-75">Us</div>
          <div className="text-5xl font-black leading-none text-lime-strong">{s.box.score.us}</div>
          <div className="mt-1 text-xs opacity-75">Team fouls {fouls.us}{fouls.us >= 4 ? " · bonus" : ""}</div>
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <span className="rounded-full bg-black/25 px-3 py-0.5 text-xs font-bold uppercase tracking-widest">
            {s.period ? periodLabel(game.config, s.period) : "Pre-game"}
          </span>
          <button
            onClick={editClock}
            disabled={!s.inPeriod}
            className="rounded-lg px-2 text-4xl font-black tabular-nums hover:bg-black/15 disabled:opacity-50 sm:text-5xl"
            title="Tap to correct the clock"
          >
            {formatClock(remaining)}
          </button>
          <button
            onClick={s.toggleClock}
            disabled={!s.inPeriod}
            className={`min-w-28 rounded-full px-4 py-1.5 text-sm font-bold disabled:opacity-40 ${
              s.clock.running ? "bg-white text-brand" : "bg-lime-strong text-black"
            }`}
          >
            {s.clock.running ? "❚❚ Pause clock" : "▶ Run clock"}
            <Kbd k="space" />
          </button>
        </div>

        <div>
          <div className="text-xs font-bold uppercase tracking-widest opacity-75">{game.opponentName}</div>
          <div className="text-5xl font-black leading-none">{s.box.score.opp}</div>
          <div className="mt-1 text-xs opacity-75">Team fouls {fouls.opp}{fouls.opp >= 4 ? " · bonus" : ""}</div>
        </div>
      </header>

      {/* Guide + period controls */}
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-card px-4 py-2.5">
        <span className="rounded-full bg-lime-soft px-3 py-1 text-xs font-bold uppercase tracking-wide text-fg ring-1 ring-lime/50">
          {guide.step}
        </span>
        <p className="min-w-0 flex-1 text-sm font-medium">{guide.text}</p>
        {selected && (
          <button onClick={() => setSelected(null)} className="text-sm font-medium text-muted underline hover:text-fg">
            Cancel
          </button>
        )}
        <button
          onClick={s.undo}
          className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-muted"
        >
          ↶ Undo last
          <Kbd k="ctrl+z" />
        </button>
        {s.inPeriod ? (
          <button
            onClick={() => {
              if (window.confirm(`End ${periodLabel(game.config, s.period)}?`)) s.endPeriod();
            }}
            className="rounded-full bg-fg px-4 py-2 text-sm font-bold text-bg hover:opacity-90"
          >
            End {periodLabel(game.config, s.period)}
          </button>
        ) : (
          <button
            onClick={startPeriod}
            disabled={lineup.length === 0}
            className="rounded-full bg-lime-strong px-5 py-2 text-sm font-bold text-black hover:brightness-95 disabled:opacity-40"
          >
            ▶ Start {periodLabel(game.config, nextPeriod)}
          </button>
        )}
      </div>

      <div className="grid flex-1 gap-4 overflow-hidden p-4 md:grid-cols-[minmax(220px,1fr)_minmax(300px,1.4fr)_minmax(260px,1.1fr)]">
        {/* Players */}
        <section className="flex min-h-0 flex-col gap-4 overflow-y-auto">
          <div>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">
              {s.inPeriod ? "On court" : `Starting five · ${lineup.length}/5`}
            </h2>
            <div className="flex flex-col gap-2">
              {courtPlayers.map((id, i) => {
                const p = byId.get(id);
                const l = s.box.players[id] ?? emptyLine();
                const isSel = selected === id;
                return (
                  <button
                    key={id}
                    onClick={() => tapCourt(id)}
                    className={`flex items-center gap-3 rounded-xl border-2 px-3 py-3 text-left transition ${
                      isSel
                        ? "border-lime bg-lime-soft shadow-md"
                        : "border-line bg-card hover:border-cyan"
                    }`}
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-black ${
                        isSel ? "bg-lime-strong text-black" : "bg-brand text-brand-fg"
                      }`}
                    >
                      {p?.jersey ?? "–"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">
                        {p?.name ?? "Unknown"}
                        {s.inPeriod && <Kbd k={String(i + 1)} />}
                      </span>
                      <span className="text-xs text-muted">
                        {l.pts} pts · {l.reb} reb · {l.ast} ast ·{" "}
                        <span className={l.pf >= 4 ? "font-bold text-opp" : ""}>{l.pf} fouls</span>
                      </span>
                    </span>
                  </button>
                );
              })}
              {courtPlayers.length === 0 && (
                <p className="rounded-xl border-2 border-dashed border-line p-4 text-sm text-muted">
                  Tap players below to add them to the starting five.
                </p>
              )}
            </div>
          </div>
          <div>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">
              Bench{s.inPeriod && selected ? " · tap to sub in" : ""}
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {bench.map((p) => {
                const l = s.box.players[p.id] ?? emptyLine();
                const canSub = !s.inPeriod || Boolean(selected);
                return (
                  <button
                    key={p.id}
                    onClick={() => tapBench(p.id)}
                    disabled={!canSub}
                    className={`rounded-xl border px-3 py-2 text-left text-sm transition disabled:opacity-55 ${
                      s.inPeriod && selected
                        ? "border-cyan bg-cyan-soft hover:border-cyan-strong"
                        : "border-line bg-card hover:border-cyan"
                    }`}
                  >
                    <span className="font-black">#{p.jersey ?? "–"}</span> {p.name}
                    <span className="block text-xs text-muted">
                      {l.pts} pts · {l.pf} fouls
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Actions */}
        <section className="flex min-h-0 flex-col gap-4 overflow-y-auto">
          <div>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">Shots</h2>
            <div className="grid grid-cols-3 gap-2">
              {SHOTS.map((a) => (
                <ActionButton key={a.key} a={a} disabled={!canAct} onClick={() => playerAction(a)} />
              ))}
            </div>
          </div>
          <div>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">Other stats</h2>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {OTHER.map((a) => (
                <ActionButton key={a.key} a={a} disabled={!canAct} onClick={() => playerAction(a)} />
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-opp/30 bg-opp-soft/60 p-3">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-opp">{game.opponentName}</h2>
            <div className="grid grid-cols-3 gap-2">
              {([1, 2, 3] as const).map((pts, i) => (
                <button
                  key={pts}
                  onClick={() => oppScore(pts)}
                  disabled={disabled}
                  className="rounded-xl bg-opp px-2 py-3 text-lg font-black text-white hover:brightness-110 disabled:opacity-35"
                >
                  +{pts}
                  <Kbd k={"jkl"[i]} />
                </button>
              ))}
              {OPP_MISSES.map((a) => (
                <button
                  key={a.key}
                  onClick={() => oppAction(a)}
                  disabled={disabled}
                  className="rounded-xl border-2 border-opp/40 bg-card px-2 py-2.5 text-sm font-bold text-fg hover:border-opp disabled:opacity-35"
                >
                  {a.label}
                  <Kbd k={a.key} />
                </button>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {OPP_OTHER.map((a) => (
                <button
                  key={a.key}
                  onClick={() => oppAction(a)}
                  disabled={disabled}
                  className={`rounded-xl px-1 py-2.5 text-xs font-bold text-fg ring-1 ring-inset disabled:opacity-35 sm:text-sm ${
                    a.type === "foul" || a.type === "turnover"
                      ? "bg-warn-soft ring-warn/50"
                      : "bg-card ring-line hover:ring-muted"
                  }`}
                >
                  {a.label}
                  <Kbd k={a.key} />
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => announce(s.record("timeout", {}, { side: "us" }))}
              disabled={disabled}
              className="rounded-xl border border-line bg-card px-3 py-2.5 text-sm font-medium hover:border-muted disabled:opacity-35"
            >
              Our timeout
            </button>
            <button
              onClick={() => announce(s.record("timeout", {}, { side: "opp" }))}
              disabled={disabled}
              className="rounded-xl border border-line bg-card px-3 py-2.5 text-sm font-medium hover:border-muted disabled:opacity-35"
            >
              {game.opponentName} timeout
            </button>
          </div>
          <p className="hidden text-xs text-muted lg:block">
            Keyboard: 1–5 pick a player · letter keys record · Opponent: J / K / L +1 / +2 / +3 · M / , / .
            missed FT / 2 / 3 · G / H off. / def. rebound · V turnover · P foul · Space clock · Esc cancel ·
            Ctrl+Z undo
          </p>
        </section>

        {/* Log / box score */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-card">
          <div className="flex gap-1 border-b border-line p-1.5 text-sm">
            {(coach ? (["log", "box", "coach"] as const) : (["log", "box"] as const)).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 rounded-lg px-3 py-1.5 font-bold transition ${
                  tab === t ? "bg-brand text-brand-fg" : "text-muted hover:bg-card-2"
                }`}
              >
                {t === "log" ? "Play-by-play" : t === "box" ? "Box score" : "Coach"}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === "log" ? (
              <ul className="divide-y divide-line text-sm">
                {log.length === 0 && (
                  <li className="p-4 text-muted">No plays yet. They&apos;ll appear here as you record them.</li>
                )}
                {log.map((e) => (
                  <li key={e.id} className="flex items-center gap-2 px-3 py-2">
                    <span className="w-16 shrink-0 text-xs font-medium text-muted tabular-nums">
                      {periodLabel(game.config, e.period)} {formatClock(e.clockMs)}
                    </span>
                    <span className={`min-w-0 flex-1 ${e.side === "opp" ? "text-opp" : ""}`}>
                      <span className="font-medium">{describeEvent(e, game.config, nameOf)}</span>
                      {e.side === "opp" && e.type !== "period_start" && e.type !== "period_end"
                        ? ` · ${game.opponentName}`
                        : ""}
                      {e.side === "us" && e.playerId && (
                        <select
                          value={e.playerId}
                          onChange={(ev) => s.reassign(e.id, ev.target.value)}
                          className="ml-1 max-w-[9rem] rounded-md border border-line bg-card px-1 text-xs text-fg"
                          aria-label="Change player"
                          title="Wrong player? Change it here"
                        >
                          {players.map((p) => (
                            <option key={p.id} value={p.id}>
                              #{p.jersey ?? "–"} {p.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </span>
                    <button
                      onClick={() => s.remove(e.id)}
                      className="rounded-md px-1.5 text-muted hover:bg-opp-soft hover:text-opp"
                      aria-label="Delete play"
                      title="Delete this play"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            ) : tab === "coach" && coach ? (
              <div className="p-2">
                <CoachView
                  config={game.config}
                  events={s.events as BasketballEvent[]}
                  players={players}
                  baselineGames={coach.baselineGames}
                  thresholds={thresholds}
                  teamName={coach.teamName}
                  opponentName={game.opponentName}
                  mode="panel"
                />
              </div>
            ) : (
              <BoxTable players={players} lines={s.box.players} showAll compact />
            )}
          </div>
        </section>
      </div>

      {/* Confirmation toast with one-tap undo */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-full bg-fg px-5 py-3 text-sm text-bg shadow-xl"
        >
          <span>
            <span className="text-lime-strong dark:text-lime">✓</span> {toast.text}
          </span>
          <button
            onClick={() => {
              s.remove(toast.id);
              setToast(null);
            }}
            className="font-bold text-cyan-strong underline dark:text-cyan"
          >
            Undo
          </button>
        </div>
      )}
    </main>
  );
}

function ActionButton({ a, disabled, onClick }: { a: PlayerAction; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-16 flex-col items-center justify-center rounded-xl px-2 py-2 transition active:scale-95 disabled:opacity-35 ${toneClass[a.tone]}`}
    >
      <span className="text-base font-black leading-tight">
        {a.label}
        <Kbd k={a.key} />
      </span>
      {a.sub && <span className="text-xs font-medium opacity-80">{a.sub}</span>}
    </button>
  );
}
