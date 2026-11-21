import { describe, expect, it } from "vitest";
import type { GameEvent } from "@/lib/sports/types";
import { Outbox, type KeyValueStore } from "./outbox";

function memoryStore(): KeyValueStore {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

const e = (id: string, seq: number, deleted = false): GameEvent => ({
  id, gameId: "g1", seq, period: 1, clockMs: 0, side: "us", type: "shot",
  playerId: null, payload: {}, deleted,
});

describe("Outbox", () => {
  it("dedupes by id so offline edits replace the pending version", () => {
    const box = new Outbox(memoryStore());
    box.enqueue(e("x", 1));
    box.enqueue(e("x", 1, true));
    expect(box.pending("g1")).toEqual([e("x", 1, true)]);
  });

  it("keeps events queued when sending fails", async () => {
    const box = new Outbox(memoryStore());
    box.enqueue(e("x", 1));
    await expect(box.flush("g1", async () => { throw new Error("offline"); })).rejects.toThrow();
    expect(box.pending("g1")).toHaveLength(1);
  });

  it("keeps events added during an in-flight flush", async () => {
    const box = new Outbox(memoryStore());
    box.enqueue(e("x", 1));
    await box.flush("g1", async () => box.enqueue(e("y", 2)));
    expect(box.pending("g1").map((p) => p.id)).toEqual(["y"]);
  });
});
