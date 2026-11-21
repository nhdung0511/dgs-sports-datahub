/** Game clock as plain data, so it survives a page reload via localStorage. */
export interface ClockState {
  running: boolean;
  /** Time left when the clock was last started/stopped/set. */
  remainingMs: number;
  /** Date.now() when the clock was started, if running. */
  startedAt: number | null;
}

export const stoppedClock = (remainingMs: number): ClockState => ({
  running: false,
  remainingMs,
  startedAt: null,
});

export function clockNow(c: ClockState, now: number): number {
  if (!c.running || c.startedAt === null) return c.remainingMs;
  return Math.max(0, c.remainingMs - (now - c.startedAt));
}

export function startClock(c: ClockState, now: number): ClockState {
  if (c.running || c.remainingMs <= 0) return c;
  return { running: true, remainingMs: c.remainingMs, startedAt: now };
}

export function stopClock(c: ClockState, now: number): ClockState {
  return stoppedClock(clockNow(c, now));
}

/** "7:05" above a minute, "42.3" (tenths) in the last minute — like a real scoreboard. */
export function formatClock(ms: number): string {
  if (ms < 60_000) return (Math.floor(ms / 100) / 10).toFixed(1);
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Parses "7:05", "7", or "42.3" into ms. Returns null when unreadable. */
export function parseClock(input: string): number | null {
  const t = input.trim();
  const mmss = /^(\d{1,2}):(\d{1,2}(?:\.\d)?)$/.exec(t);
  if (mmss) {
    const sec = Number(mmss[2]);
    if (sec >= 60) return null;
    return Math.round((Number(mmss[1]) * 60 + sec) * 1000);
  }
  if (/^\d+(\.\d)?$/.test(t)) return Math.round(Number(t) * 1000);
  return null;
}
