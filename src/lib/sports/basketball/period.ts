import { liveEvents } from "../types";
import type { BasketballConfig, BasketballEvent } from "./events";

export interface PeriodState {
  /** Current (or most recently finished) period; 0 before tip-off. */
  period: number;
  inPeriod: boolean;
}

export function periodState(events: readonly BasketballEvent[]): PeriodState {
  let period = 0;
  let inPeriod = false;
  for (const e of liveEvents(events)) {
    if (e.type === "period_start") {
      period = e.period;
      inPeriod = true;
    } else if (e.type === "period_end") {
      inPeriod = false;
    }
  }
  return { period, inPeriod };
}

/** Q1–Q4 or H1–H2, then OT1, OT2… */
export function periodLabel(config: BasketballConfig, period: number): string {
  if (period > config.periodCount) return `OT${period - config.periodCount}`;
  if (config.periodCount === 2) return `H${period}`;
  if (config.periodCount === 4) return `Q${period}`;
  return `P${period}`;
}
