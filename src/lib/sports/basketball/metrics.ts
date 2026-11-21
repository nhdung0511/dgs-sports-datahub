/**
 * The catalogue of player metrics the Analysis tab can show: one definition per metric, used by
 * the leaderboard columns, radar spokes and scatter-plot axes alike.
 */
import { inUnit, type CountingStat, type PlayerAdvanced, type PlayerAgg, type Unit } from "./advanced";

export type MetricGroup = "box" | "shooting" | "usage" | "rebdef" | "impact";

export const GROUP_LABELS: Record<MetricGroup, string> = {
  box: "Box score",
  shooting: "Shooting",
  usage: "Usage & playmaking",
  rebdef: "Rebounding & defense",
  impact: "Impact",
};

export type MetricFormat = "num" | "pct" | "rating" | "ratio";

export interface Metric {
  key: string;
  /** Short column label. */
  label: string;
  /** One-line explanation for tooltips and the glossary. */
  help: string;
  group: MetricGroup;
  format: MetricFormat;
  lowerIsBetter?: boolean;
  /** Counting stats change with the unit (per 32, per game, ...); rates don't. */
  counting?: boolean;
  /** Only available from games with opponent stats. */
  needsOpponent?: boolean;
  value: (agg: PlayerAgg, adv: PlayerAdvanced, unit: Unit) => number | null;
}

const counting = (
  key: CountingStat,
  label: string,
  help: string,
  extra: Partial<Metric> = {},
): Metric => ({
  key,
  label,
  help,
  group: "box",
  format: "num",
  counting: true,
  value: (agg, _adv, unit) => inUnit(agg, key, unit),
  ...extra,
});

const rate = (
  key: keyof PlayerAdvanced,
  label: string,
  help: string,
  group: MetricGroup,
  format: MetricFormat,
  extra: Partial<Metric> = {},
): Metric => ({
  key,
  label,
  help,
  group,
  format,
  value: (_agg, adv) => adv[key] as number | null,
  ...extra,
});

export const METRICS: Metric[] = [
  counting("pts", "PTS", "Points"),
  counting("reb", "REB", "Total rebounds"),
  counting("oreb", "OREB", "Offensive rebounds"),
  counting("dreb", "DREB", "Defensive rebounds"),
  counting("ast", "AST", "Assists"),
  counting("stl", "STL", "Steals"),
  counting("blk", "BLK", "Blocks"),
  counting("tov", "TOV", "Turnovers", { lowerIsBetter: true }),
  counting("pf", "PF", "Personal fouls", { lowerIsBetter: true }),
  counting("fga", "FGA", "Field-goal attempts"),
  counting("tpa", "3PA", "Three-point attempts"),
  counting("fta", "FTA", "Free-throw attempts"),

  rate("efgPct", "eFG%", "Effective field-goal %: FG% with threes worth 1.5 makes", "shooting", "pct"),
  rate("tsPct", "TS%", "True shooting %: scoring efficiency including free throws", "shooting", "pct"),
  rate("threePaRate", "3PAr", "Share of field-goal attempts that are threes", "shooting", "pct"),
  rate("ftRate", "FTr", "Free-throw attempts per field-goal attempt", "shooting", "pct"),
  rate("pointsPerShot", "PPS", "Points per scoring attempt (FGA + 0.44 × FTA)", "shooting", "ratio"),

  rate("usgPct", "USG%", "Share of team plays used (shots, free throws, turnovers) while on court", "usage", "pct"),
  rate("astPct", "AST%", "Share of teammates' made shots they assisted while on court", "usage", "pct"),
  rate("astToRatio", "AST/TO", "Assists per turnover", "usage", "ratio"),
  rate("tovPct", "TOV%", "Turnovers per 100 plays used", "usage", "pct", { lowerIsBetter: true }),

  rate("orebPct", "OREB%", "Share of available offensive rebounds grabbed while on court", "rebdef", "pct", { needsOpponent: true }),
  rate("drebPct", "DREB%", "Share of available defensive rebounds grabbed while on court", "rebdef", "pct", { needsOpponent: true }),
  rate("rebPct", "REB%", "Share of all available rebounds grabbed while on court", "rebdef", "pct", { needsOpponent: true }),
  rate("stlPct", "STL%", "Steals per 100 opponent possessions while on court", "rebdef", "pct", { needsOpponent: true }),
  rate("blkPct", "BLK%", "Share of opponent two-point attempts blocked while on court", "rebdef", "pct", { needsOpponent: true }),

  rate("plusMinusPer32", "+/- /32", "Point difference per 32 minutes on court", "impact", "num"),
  rate("onNetRtg", "On NetRtg", "Team points minus opponent points per 100 possessions with them on court", "impact", "rating", { needsOpponent: true }),
  rate("onOffNet", "On-Off", "Net rating on court minus net rating off court", "impact", "rating", { needsOpponent: true }),
  rate("gameScorePer32", "GmSc/32", "Game Score per 32 minutes: one-number box-score summary", "impact", "num"),
];

export const metricByKey = (key: string) => METRICS.find((m) => m.key === key);

/** Default radar spokes: a balanced all-round profile. */
export const DEFAULT_RADAR = ["pts", "tsPct", "usgPct", "astPct", "tovPct", "rebPct", "stlPct", "blkPct", "onNetRtg", "gameScorePer32"];

export function formatMetric(m: Metric, v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "–";
  switch (m.format) {
    case "pct":
      return `${v.toFixed(1)}%`;
    case "rating":
      return (v > 0 ? "+" : "") + v.toFixed(1);
    case "ratio":
      return v.toFixed(2);
    default:
      return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1);
  }
}
