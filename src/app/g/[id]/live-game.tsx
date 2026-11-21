"use client";

import { useEffect, useMemo, useState } from "react";
import { BoxTable } from "@/components/box-table";
import { CsvButton } from "@/components/csv-button";
import { formatDate, StatusPill } from "@/components/game-card";
import { card } from "@/components/ui";
import { safeFilename } from "@/lib/csv";
import { fromRow, type GameEventRow } from "@/lib/db/events";
import type { BasketballGame } from "@/lib/db/games";
import { boxScoreRows, playByPlayRows } from "@/lib/sports/basketball/columns";
import { formatClock } from "@/lib/sports/basketball/clock";
import { describeEvent } from "@/lib/sports/basketball/describe";
import type { BasketballEvent } from "@/lib/sports/basketball/events";
import { periodLabel, periodState } from "@/lib/sports/basketball/period";
import { teamLine } from "@/lib/sports/basketball/season";
import { computeBoxScore } from "@/lib/sports/basketball/stats";
import { liveEvents, type GameEvent, type GameStatus, type Player } from "@/lib/sports/types";
import { createClient } from "@/lib/supabase/client";

interface Props {
  game: BasketballGame;
  teamName: string;
  players: Player[];
  initialEvents: GameEvent[];
}

export function LiveGame({ game, teamName, players, initialEvents }: Props) {
  const [events, setEvents] = useState(initialEvents as BasketballEvent[]);
  const [status, setStatus] = useState<GameStatus>(game.status);
  const [connected, setConnected] = useState(false);
  const [tab, setTab] = useState<"box" | "pbp">("box");

  // Realtime: every insert/update to this game's events (and status changes) streams in.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`game:${game.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_events", filter: `game_id=eq.${game.id}` },
        (payload) => {
          if (!payload.new || !("id" in payload.new)) return;
          const ev = fromRow(payload.new as GameEventRow) as BasketballEvent;
          setEvents((prev) => {
            const next = prev.filter((e) => e.id !== ev.id);
            next.push(ev);
            return next.sort((a, b) => a.seq - b.seq);
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${game.id}` },
        (payload) => setStatus((payload.new as { status: GameStatus }).status),
      )
      .subscribe((s) => setConnected(s === "SUBSCRIBED"));
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [game.id]);

  const box = useMemo(() => computeBoxScore(events), [events]);
  const live = useMemo(() => liveEvents(events), [events]);
  const { period, inPeriod } = periodState(events);
  const last = live[live.length - 1];
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const nameOf = (id: string) => byId.get(id)?.name ?? "Unknown";
  const tag = (id: string) => {
    const p = byId.get(id);
    return p ? `#${p.jersey ?? "–"} ${p.name}` : "Unknown";
  };
  const periods = Math.max(game.config.periodCount, period);
  const { us, opp } = box.score;
  const fileBase = safeFilename(`${teamName} vs ${game.opponentName} ${game.startsAt?.slice(0, 10) ?? ""}`);

  return (
    <div className="space-y-6">
      {/* Scoreboard */}
      <section className="overflow-hidden rounded-3xl bg-brand text-brand-fg shadow-lg shadow-brand/20">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 text-sm">
          <span className="opacity-80">{formatDate(game.startsAt)}</span>
          <span className="flex items-center gap-2">
            {status === "live" && (
              <span className="text-xs opacity-80">{connected ? "Updating live" : "Connecting…"}</span>
            )}
            <StatusPill status={status} />
          </span>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 pb-6 pt-2">
          <div className="text-right">
            <div className="truncate text-sm font-bold uppercase tracking-widest opacity-80">{teamName}</div>
            <div className="text-6xl font-black leading-none text-lime-strong sm:text-7xl">{us}</div>
          </div>
          <div className="text-center">
            <div className="rounded-full bg-black/25 px-3 py-1 text-sm font-bold">
              {status === "final" ? "Final" : period ? periodLabel(game.config, period) : "Pre-game"}
            </div>
            {status !== "final" && last && (
              <div className="mt-1 text-xs opacity-80">
                {inPeriod ? `${formatClock(last.clockMs)} at last play` : "Break"}
              </div>
            )}
          </div>
          <div>
            <div className="truncate text-sm font-bold uppercase tracking-widest opacity-80">{game.opponentName}</div>
            <div className="text-6xl font-black leading-none sm:text-7xl">{opp}</div>
          </div>
        </div>
        {last && status !== "final" && (
          <div className="border-t border-white/15 bg-black/15 px-5 py-2.5 text-sm">
            <span className="opacity-70">Last play: </span>
            <b>{describeEvent(last, game.config, nameOf)}</b>
            {last.side === "opp" && last.type !== "period_start" && last.type !== "period_end"
              ? ` · ${game.opponentName}`
              : last.playerId
                ? ` · ${tag(last.playerId)}`
                : ""}
          </div>
        )}
      </section>

      {/* Line score */}
      {period > 0 && (
        <section className={`${card} overflow-x-auto`}>
          <table className="w-full text-sm tabular-nums">
            <thead className="bg-card-2 text-xs text-muted">
              <tr>
                <th className="px-4 py-2 text-left">Team</th>
                {Array.from({ length: periods }, (_, i) => (
                  <th key={i} className="px-3 py-2 text-right">
                    {periodLabel(game.config, i + 1)}
                  </th>
                ))}
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2 text-right" title="Team fouls this period">
                  Fouls
                </th>
              </tr>
            </thead>
            <tbody>
              {(["us", "opp"] as const).map((side) => (
                <tr key={side} className="border-t border-line">
                  <td className="px-4 py-2 font-bold">{side === "us" ? teamName : game.opponentName}</td>
                  {Array.from({ length: periods }, (_, i) => (
                    <td key={i} className="px-3 py-2 text-right">
                      {i < period ? (box.scoreByPeriod[side][i] ?? 0) : "–"}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right text-lg font-black">{box.score[side]}</td>
                  <td className="px-4 py-2 text-right">{box.foulsByPeriod[side][period - 1] ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Box score / play-by-play */}
      <section className={card}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-2">
          {(["box", "pbp"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
                tab === t ? "bg-brand text-brand-fg" : "text-muted hover:bg-card-2"
              }`}
            >
              {t === "box" ? "Box score" : "Play-by-play"}
            </button>
          ))}
          <div className="ml-auto flex flex-wrap gap-2">
            <CsvButton
              filename={`${fileBase}-box-score`}
              label="Box score CSV"
              rows={() => boxScoreRows(players, box.players)}
            />
            <CsvButton
              filename={`${fileBase}-play-by-play`}
              label="Play-by-play CSV"
              rows={() => playByPlayRows(live, players, game.config, game.opponentName)}
            />
          </div>
        </div>
        {tab === "box" ? (
          <BoxTable players={players} lines={box.players} totals={teamLine(box)} />
        ) : (
          <ul className="max-h-[32rem] divide-y divide-line overflow-y-auto text-sm">
            {live.length === 0 && <li className="p-6 text-center text-muted">No plays yet. Tip-off soon!</li>}
            {live
              .slice()
              .reverse()
              .map((e) => {
                const structural = e.type === "period_start" || e.type === "period_end";
                return (
                  <li
                    key={e.id}
                    className={`flex items-center gap-3 px-4 py-2 ${structural ? "bg-card-2 font-bold" : ""}`}
                  >
                    <span className="w-20 shrink-0 text-xs text-muted tabular-nums">
                      {periodLabel(game.config, e.period)} {formatClock(e.clockMs)}
                    </span>
                    <span className={`flex-1 ${e.side === "opp" && !structural ? "text-opp" : ""}`}>
                      {describeEvent(e, game.config, nameOf)}
                      {!structural && (e.side === "opp" ? ` · ${game.opponentName}` : e.playerId ? ` · ${tag(e.playerId)}` : "")}
                    </span>
                  </li>
                );
              })}
          </ul>
        )}
      </section>
    </div>
  );
}
