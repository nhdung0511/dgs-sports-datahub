import { describe, expect, it } from "vitest";
import { clockNow, formatClock, parseClock, startClock, stopClock, stoppedClock } from "./clock";
import type { BasketballEvent } from "./events";
import { FIBA_CONFIG } from "./events";
import { periodLabel, periodState } from "./period";

describe("clock", () => {
  it("counts down while running and freezes when stopped", () => {
    const c = startClock(stoppedClock(600_000), 1_000);
    expect(clockNow(c, 4_000)).toBe(597_000);
    const s = stopClock(c, 4_000);
    expect(clockNow(s, 99_000)).toBe(597_000);
  });

  it("never goes below zero and won't start at zero", () => {
    const c = startClock(stoppedClock(1_000), 0);
    expect(clockNow(c, 5_000)).toBe(0);
    expect(startClock(stoppedClock(0), 0).running).toBe(false);
  });

  it("formats like a scoreboard", () => {
    expect(formatClock(600_000)).toBe("10:00");
    expect(formatClock(65_400)).toBe("1:06");
    expect(formatClock(42_380)).toBe("42.3");
    expect(formatClock(0)).toBe("0.0");
  });

  it("parses typed clock values", () => {
    expect(parseClock("7:05")).toBe(425_000);
    expect(parseClock("42.3")).toBe(42_300);
    expect(parseClock("8")).toBe(8_000);
    expect(parseClock("7:75")).toBeNull();
    expect(parseClock("abc")).toBeNull();
  });
});

describe("periodState", () => {
  const base = { gameId: "g", clockMs: 0, side: "us", playerId: null, deleted: false } as const;
  it("tracks the current period and whether it is live", () => {
    const events = [
      { ...base, id: "1", seq: 1, period: 1, type: "period_start", payload: { lineup: [] } },
      { ...base, id: "2", seq: 2, period: 1, type: "period_end", payload: {} },
    ] as BasketballEvent[];
    expect(periodState([])).toEqual({ period: 0, inPeriod: false });
    expect(periodState(events.slice(0, 1))).toEqual({ period: 1, inPeriod: true });
    expect(periodState(events)).toEqual({ period: 1, inPeriod: false });
  });

  it("labels quarters, halves and overtime", () => {
    expect(periodLabel(FIBA_CONFIG, 3)).toBe("Q3");
    expect(periodLabel(FIBA_CONFIG, 5)).toBe("OT1");
    expect(periodLabel({ ...FIBA_CONFIG, periodCount: 2 }, 2)).toBe("H2");
  });
});
