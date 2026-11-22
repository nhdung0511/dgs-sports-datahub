"use client";

import { useEffect, useRef, useState } from "react";
import { fetchGameEvents, fromRow, type GameEventRow } from "@/lib/db/events";
import type { GameEvent, GameStatus } from "@/lib/sports/types";
import { createClient } from "@/lib/supabase/client";

const POLL_MS = 10_000;

export interface LiveEvents<E extends GameEvent> {
  events: E[];
  status: GameStatus;
  /** Realtime channel is subscribed. */
  connected: boolean;
  /** Date.now() of the last successful update (realtime message or poll). */
  lastUpdate: number;
}

function merge<E extends GameEvent>(prev: E[], incoming: E[]): E[] {
  const byId = new Map(prev.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) => a.seq - b.seq);
}

/**
 * A game's events, kept live: Supabase Realtime for instant updates, plus a poll every 10 s
 * while the channel is down (gym wifi), so the page catches up on its own.
 */
export function useLiveEvents<E extends GameEvent>(
  gameId: string,
  initialEvents: readonly GameEvent[],
  initialStatus: GameStatus,
): LiveEvents<E> {
  const [events, setEvents] = useState(initialEvents as E[]);
  const [status, setStatus] = useState(initialStatus);
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(() => Date.now());
  const connectedRef = useRef(false);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`game:${gameId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_events", filter: `game_id=eq.${gameId}` },
        (payload) => {
          if (!payload.new || !("id" in payload.new)) return;
          setEvents((prev) => merge(prev, [fromRow(payload.new as GameEventRow) as E]));
          setLastUpdate(Date.now());
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${gameId}` },
        (payload) => setStatus((payload.new as { status: GameStatus }).status),
      )
      .subscribe((s) => {
        connectedRef.current = s === "SUBSCRIBED";
        setConnected(connectedRef.current);
        if (connectedRef.current) setLastUpdate(Date.now());
      });

    const poll = setInterval(async () => {
      if (connectedRef.current) return;
      try {
        const [fresh, game] = await Promise.all([
          fetchGameEvents(supabase, gameId),
          supabase.from("games").select("status").eq("id", gameId).maybeSingle(),
        ]);
        setEvents((prev) => merge(prev, fresh as E[]));
        if (game.data) setStatus(game.data.status as GameStatus);
        setLastUpdate(Date.now());
      } catch {
        // Offline: keep the last numbers; the staleness badge tells the coach.
      }
    }, POLL_MS);

    return () => {
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [gameId]);

  return { events, status, connected, lastUpdate };
}
