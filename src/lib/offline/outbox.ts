import type { GameEvent } from "@/lib/sports/types";

/**
 * Offline outbox for the courtside device. Every new or edited event is written
 * here first, then flushed to Supabase. Keyed by event id, so an edit made while
 * offline replaces the pending version instead of queuing a duplicate.
 */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const key = (gameId: string) => `outbox:${gameId}`;

export class Outbox {
  constructor(private store: KeyValueStore) {}

  pending(gameId: string): GameEvent[] {
    try {
      const raw = this.store.getItem(key(gameId));
      return raw ? (JSON.parse(raw) as GameEvent[]) : [];
    } catch {
      return [];
    }
  }

  enqueue(event: GameEvent) {
    const byId = new Map(this.pending(event.gameId).map((e) => [e.id, e]));
    byId.set(event.id, event);
    this.save(event.gameId, [...byId.values()]);
  }

  /** Sends pending events; anything that fails stays queued for the next attempt. */
  async flush(gameId: string, send: (events: GameEvent[]) => Promise<void>): Promise<number> {
    const batch = this.pending(gameId);
    if (batch.length === 0) return 0;
    await send(batch);
    // Keep anything enqueued (or re-edited) while the send was in flight.
    const sent = new Map(batch.map((e) => [e.id, JSON.stringify(e)]));
    const rest = this.pending(gameId).filter((e) => sent.get(e.id) !== JSON.stringify(e));
    this.save(gameId, rest);
    return batch.length;
  }

  private save(gameId: string, events: GameEvent[]) {
    this.store.setItem(key(gameId), JSON.stringify(events));
  }
}
