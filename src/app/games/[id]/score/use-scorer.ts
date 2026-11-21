"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { upsertGameEvents } from "@/lib/db/events";
import { Outbox } from "@/lib/offline/outbox";
import { browserStore, readJson } from "@/lib/offline/storage";
import {
  clockNow,
  startClock,
  stopClock,
  stoppedClock,
  type ClockState,
} from "@/lib/sports/basketball/clock";
import {
  periodLengthMs,
  type BasketballConfig,
  type BasketballEvent,
  type BasketballEventType,
  type BasketballPayloads,
} from "@/lib/sports/basketball/events";
import { periodState } from "@/lib/sports/basketball/period";
import { computeBoxScore } from "@/lib/sports/basketball/stats";
import { liveEvents, type GameEvent, type GameStatus, type Side } from "@/lib/sports/types";
import { createClient } from "@/lib/supabase/client";

export type SyncStatus =
  | { kind: "synced" }
  | { kind: "pending"; count: number }
  | { kind: "error"; count: number; message: string };

interface Options {
  gameId: string;
  config: BasketballConfig;
  initialEvents: GameEvent[];
  initialStatus: GameStatus;
}

const eventsKey = (id: string) => `events:${id}`;
const clockKey = (id: string) => `clock:${id}`;

function mergeById(a: readonly BasketballEvent[], b: readonly BasketballEvent[]) {
  const m = new Map(a.map((e) => [e.id, e]));
  for (const e of b) m.set(e.id, e);
  return [...m.values()].sort((x, y) => x.seq - y.seq);
}

/**
 * All scorekeeping state for one game. Every change goes:
 * event log (state + localStorage) → outbox → Supabase (when online).
 */
export function useScorer({ gameId, config, initialEvents, initialStatus }: Options) {
  const store = useMemo(() => (typeof window === "undefined" ? null : browserStore()), []);
  const outbox = useMemo(() => (store ? new Outbox(store) : null), [store]);
  const supabase = useMemo(() => createClient(), []);

  const [events, setEvents] = useState<BasketballEvent[]>(initialEvents as BasketballEvent[]);
  const [clock, setClock] = useState<ClockState>(stoppedClock(periodLengthMs(config, 1)));
  const [status, setStatusState] = useState<GameStatus>(initialStatus);
  const [loaded, setLoaded] = useState(false);
  const [sync, setSync] = useState<SyncStatus>({ kind: "synced" });
  const eventsRef = useRef(events);
  eventsRef.current = events;

  // Restore this device's copy (it may hold plays the server hasn't received yet).
  useEffect(() => {
    if (!store) return;
    const local = readJson<BasketballEvent[]>(store, eventsKey(gameId)) ?? [];
    setEvents((server) => mergeById(server, local));
    const savedClock = readJson<ClockState>(store, clockKey(gameId));
    if (savedClock) setClock(savedClock);
    setLoaded(true);
  }, [store, gameId]);

  useEffect(() => {
    if (loaded && store) store.setItem(eventsKey(gameId), JSON.stringify(events));
  }, [loaded, store, gameId, events]);

  useEffect(() => {
    if (loaded && store) store.setItem(clockKey(gameId), JSON.stringify(clock));
  }, [loaded, store, gameId, clock]);

  // --- sync -----------------------------------------------------------------
  const flushing = useRef(false);
  const flush = useCallback(async () => {
    if (!outbox || flushing.current) return;
    flushing.current = true;
    try {
      await outbox.flush(gameId, (batch) => upsertGameEvents(supabase, batch));
      const left = outbox.pending(gameId).length;
      setSync(left ? { kind: "pending", count: left } : { kind: "synced" });
      if (left) setTimeout(() => void flush(), 0);
    } catch (err) {
      setSync({
        kind: "error",
        count: outbox.pending(gameId).length,
        message: err instanceof Error ? err.message : "Sync failed",
      });
    } finally {
      flushing.current = false;
    }
  }, [outbox, gameId, supabase]);

  useEffect(() => {
    if (!loaded) return;
    void flush();
    const retry = setInterval(() => void flush(), 10_000);
    const online = () => void flush();
    window.addEventListener("online", online);
    return () => {
      clearInterval(retry);
      window.removeEventListener("online", online);
    };
  }, [loaded, flush]);

  const save = useCallback(
    (changed: BasketballEvent[]) => {
      // Update the ref right away so back-to-back taps get distinct seq numbers.
      const next = mergeById(eventsRef.current, changed);
      eventsRef.current = next;
      setEvents(next);
      if (!outbox) return;
      changed.forEach((e) => outbox.enqueue(e));
      setSync({ kind: "pending", count: outbox.pending(gameId).length });
      void flush();
    },
    [outbox, gameId, flush],
  );

  /** Game status lives on the games row, so it needs a connection. */
  const setStatus = useCallback(
    async (next: GameStatus) => {
      const { error } = await supabase.from("games").update({ status: next }).eq("id", gameId);
      if (error) throw error;
      setStatusState(next);
    },
    [supabase, gameId],
  );

  // --- derived state --------------------------------------------------------
  const box = useMemo(() => computeBoxScore(events), [events]);
  const { period, inPeriod } = useMemo(() => periodState(events), [events]);

  // --- actions --------------------------------------------------------------
  const record = useCallback(
    <K extends BasketballEventType>(
      type: K,
      payload: BasketballPayloads[K],
      opts: { side?: Side; playerId?: string | null; period?: number; clockMs?: number } = {},
    ) => {
      const all = eventsRef.current;
      const seq = all.reduce((max, e) => Math.max(max, e.seq), 0) + 1;
      const ev = {
        id: crypto.randomUUID(),
        gameId,
        seq,
        period: opts.period ?? period,
        clockMs: opts.clockMs ?? clockNow(clock, Date.now()),
        side: opts.side ?? "us",
        type,
        playerId: opts.playerId ?? null,
        payload,
        deleted: false,
      } as BasketballEvent;
      save([ev]);
      return ev;
    },
    [gameId, period, clock, save],
  );

  const startPeriod = useCallback(
    (lineup: string[]) => {
      const next = period + 1;
      const len = periodLengthMs(config, next);
      record("period_start", { lineup }, { period: next, clockMs: len });
      setClock(stoppedClock(len));
      if (status === "scheduled") void setStatus("live").catch(() => {});
    },
    [period, config, record, status, setStatus],
  );

  const endPeriod = useCallback(() => {
    const now = Date.now();
    record("period_end", {}, { clockMs: clockNow(clock, now) });
    setClock(stopClock(clock, now));
  }, [clock, record]);

  const remove = useCallback(
    (id: string) => {
      const ev = eventsRef.current.find((e) => e.id === id);
      if (ev && !ev.deleted) save([{ ...ev, deleted: true }]);
    },
    [save],
  );

  const undo = useCallback(() => {
    const live = liveEvents(eventsRef.current);
    const last = live[live.length - 1];
    if (!last) return;
    remove(last.id);
    // Undoing a period start puts the clock back where the previous period left it.
    if (last.type === "period_start") {
      const prev = live[live.length - 2];
      setClock(stoppedClock(prev ? prev.clockMs : periodLengthMs(config, 1)));
    }
  }, [remove, config]);

  const reassign = useCallback(
    (id: string, playerId: string) => {
      const ev = eventsRef.current.find((e) => e.id === id);
      if (ev && ev.playerId !== playerId) save([{ ...ev, playerId }]);
    },
    [save],
  );

  const toggleClock = useCallback(() => {
    const now = Date.now();
    setClock((c) => (c.running ? stopClock(c, now) : startClock(c, now)));
  }, []);

  const setClockMs = useCallback((ms: number) => setClock(stoppedClock(Math.max(0, ms))), []);

  // Auto-stop at 0:00.
  useEffect(() => {
    if (!clock.running) return;
    const t = setTimeout(
      () => setClock((c) => stopClock(c, Date.now())),
      clockNow(clock, Date.now()) + 5,
    );
    return () => clearTimeout(t);
  }, [clock]);

  return {
    loaded,
    events,
    box,
    period,
    inPeriod,
    clock,
    status,
    sync,
    record,
    startPeriod,
    endPeriod,
    undo,
    remove,
    reassign,
    toggleClock,
    setClockMs,
    setStatus,
    flush,
  };
}
