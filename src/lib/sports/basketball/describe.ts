import type { BasketballConfig, BasketballEvent } from "./events";
import { periodLabel } from "./period";

/** Human-readable play-by-play line (without the player name). */
export function describeEvent(
  e: BasketballEvent,
  config: BasketballConfig,
  nameOf: (id: string) => string,
): string {
  switch (e.type) {
    case "period_start":
      return `Start of ${periodLabel(config, e.period)}`;
    case "period_end":
      return `End of ${periodLabel(config, e.period)}`;
    case "shot": {
      const kind = e.payload.points === 1 ? "Free throw" : `${e.payload.points}PT`;
      return `${kind} ${e.payload.made ? "made" : "missed"}`;
    }
    case "rebound":
      return e.payload.offensive ? "Offensive rebound" : "Defensive rebound";
    case "sub":
      return `${nameOf(e.payload.playerIn)} in for ${nameOf(e.payload.playerOut)}`;
    case "assist":
      return "Assist";
    case "steal":
      return "Steal";
    case "block":
      return "Block";
    case "turnover":
      return "Turnover";
    case "foul":
      return "Foul";
    case "timeout":
      return "Timeout";
  }
}
