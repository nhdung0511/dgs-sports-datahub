"use client";

import { useMemo, useRef, useState } from "react";
import { btnGhost, input, label } from "@/components/ui";
import { saveSvgAsPng } from "@/lib/save-png";
import { aggregatePlayers, percentileOf, playerAdvanced } from "@/lib/sports/basketball/advanced";
import { DEFAULT_RADAR, formatMetric, metricByKey, type Metric } from "@/lib/sports/basketball/metrics";
import { metricPercentiles, PLAYER_COLORS, shortName, toAnalysisGames, type ViewProps } from "./shared";

const PRESETS: Record<string, { label: string; keys: string[] }> = {
  allround: { label: "All-round", keys: DEFAULT_RADAR },
  scoring: { label: "Scoring", keys: ["pts", "tsPct", "efgPct", "threePaRate", "ftRate", "pointsPerShot", "usgPct"] },
  playmaking: { label: "Playmaking", keys: ["ast", "astPct", "astToRatio", "tovPct", "usgPct", "stl"] },
  defense: { label: "Defense & boards", keys: ["reb", "orebPct", "drebPct", "stlPct", "blkPct", "pf", "onNetRtg"] },
};

type Mode = "team" | "past";

interface Shape {
  name: string;
  color: string;
  /** Percentile per spoke (null = not enough data, drawn at the centre). */
  pcts: (number | null)[];
  /** Raw value per spoke, for the tooltip and table. */
  values: (number | null)[];
  dashed?: boolean;
}

/** Percentile radars: compare up to 4 teammates, or one player's recent form against their earlier games. */
export function RadarView({ rows, games, unit, minMinutes }: ViewProps) {
  const [preset, setPreset] = useState("allround");
  const [mode, setMode] = useState<Mode>("team");
  const eligible = rows.filter((r) => r.eligible);
  const [picked, setPicked] = useState<string[]>(() => (eligible.length ? eligible : rows).slice(0, 2).map((r) => r.player.id));
  const metrics = PRESETS[preset].keys.map((k) => metricByKey(k)).filter((m): m is Metric => Boolean(m));
  const svgRef = useRef<SVGSVGElement>(null);

  const pcts = useMemo(
    () => Object.fromEntries(metrics.map((m) => [m.key, metricPercentiles(rows, m, unit, minMinutes)])),
    [rows, metrics, unit, minMinutes],
  );
  const pickedRows = picked.map((id) => rows.find((r) => r.player.id === id)).filter((r) => r !== undefined);

  const shapes: Shape[] = useMemo(() => {
    if (mode === "team") {
      return pickedRows.map((r, i) => ({
        name: shortName(r.player),
        color: PLAYER_COLORS[i],
        pcts: metrics.map((m) => pcts[m.key][r.player.id]),
        values: metrics.map((m) => m.value(r.agg, r.adv, unit)),
      }));
    }
    // Own past: the first picked player's last 5 games vs their earlier games, both placed
    // on the same scale as the current team pool.
    const r = pickedRows[0];
    if (!r) return [];
    const played = [...games]
      .filter((g) => g.box.players[r.player.id])
      .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
    if (played.length < 4) return [];
    const recentCount = Math.min(5, Math.floor(played.length / 2));
    const split = [
      { name: `Last ${recentCount} games`, set: played.slice(-recentCount), color: PLAYER_COLORS[0] },
      { name: `Earlier ${played.length - recentCount} games`, set: played.slice(0, -recentCount), color: PLAYER_COLORS[1], dashed: true },
    ];
    return split.map(({ name, set, color, dashed }) => {
      const agg = aggregatePlayers(toAnalysisGames(set))[r.player.id];
      const adv = playerAdvanced(agg);
      const values = metrics.map((m) => m.value(agg, adv, unit));
      return {
        name,
        color,
        dashed,
        values,
        pcts: metrics.map((m, i) => {
          const pool = eligible.map((e) => m.value(e.agg, e.adv, unit)).filter((v): v is number => v !== null);
          return percentileOf(values[i], pool, m.lowerIsBetter);
        }),
      };
    });
  }, [mode, pickedRows, metrics, pcts, games, unit, eligible]);

  function toggle(id: string) {
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 4 ? cur : [...cur, id]));
  }

  const pastTooFew = mode === "past" && pickedRows[0] && shapes.length === 0;

  return (
    <section className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="r-mode" className={label}>
            Compare against
          </label>
          <select id="r-mode" value={mode} onChange={(e) => setMode(e.target.value as Mode)} className={input}>
            <option value="team">Teammates (percentile)</option>
            <option value="past">Own past (last 5 vs earlier)</option>
            <option value="bench" disabled>
              Benchmarks (stage 4)
            </option>
          </select>
        </div>
        <div>
          <label htmlFor="r-preset" className={label}>
            Stat set
          </label>
          <select id="r-preset" value={preset} onChange={(e) => setPreset(e.target.value)} className={input}>
            {Object.entries(PRESETS).map(([k, p]) => (
              <option key={k} value={k}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button
            className={btnGhost}
            onClick={() => svgRef.current && saveSvgAsPng(svgRef.current, `dgs-radar-${preset}`)}
            disabled={shapes.length === 0}
          >
            ⤓ Save as image
          </button>
        </div>
      </div>

      <fieldset className="mb-4">
        <legend className={label}>{mode === "team" ? "Players (up to 4)" : "Player"}</legend>
        <div className="flex flex-wrap gap-2">
          {rows.map((r) => {
            const idx = picked.indexOf(r.player.id);
            const on = mode === "team" ? idx >= 0 : idx === 0;
            return (
              <button
                key={r.player.id}
                onClick={() => (mode === "team" ? toggle(r.player.id) : setPicked([r.player.id]))}
                aria-pressed={on}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium ${
                  on ? "border-fg" : "border-line text-muted hover:border-muted"
                } ${r.eligible ? "" : "opacity-50"}`}
              >
                {on && mode === "team" && <span className="h-2.5 w-2.5 rounded-full" style={{ background: PLAYER_COLORS[idx] }} />}
                {shortName(r.player)}
              </button>
            );
          })}
        </div>
      </fieldset>

      {pastTooFew ? (
        <p className="rounded-xl bg-card-2 p-6 text-center text-sm text-muted">
          Own-past comparison needs at least 4 games for this player in the selected range.
        </p>
      ) : shapes.length === 0 ? (
        <p className="rounded-xl bg-card-2 p-6 text-center text-sm text-muted">Pick a player to draw their radar.</p>
      ) : (
        <>
          <Radar svgRef={svgRef} metrics={metrics} shapes={shapes} />
          <RadarTable metrics={metrics} shapes={shapes} />
          {mode === "team" && pickedRows.some((r) => !r.eligible) && (
            <p className="mt-2 text-xs text-muted">
              Players under the minimum minutes have no percentiles, so their shape sits at the centre.
            </p>
          )}
        </>
      )}
    </section>
  );
}

const SIZE = 560;
const C = { x: SIZE / 2, y: SIZE / 2 };
const R = 185;

function Radar({ svgRef, metrics, shapes }: { svgRef: React.RefObject<SVGSVGElement | null>; metrics: Metric[]; shapes: Shape[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = metrics.length;
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const at = (i: number, pct: number) => {
    const r = (Math.max(0, Math.min(100, pct)) / 100) * R;
    return [C.x + r * Math.cos(angle(i)), C.y + r * Math.sin(angle(i))] as const;
  };

  return (
    <div className="relative mx-auto max-w-xl">
      <svg ref={svgRef} viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-auto w-full" role="img" aria-label="Percentile radar">
        {/* Rings at 25/50/75/100th percentile */}
        {[25, 50, 75, 100].map((p) => (
          <g key={p}>
            <polygon
              points={metrics.map((_, i) => at(i, p).join(",")).join(" ")}
              fill="none"
              stroke="var(--line)"
              strokeWidth={1}
            />
            {/* Ring value sits halfway between the first two spokes, clear of their labels. */}
            <text
              x={C.x + (p / 100) * R * Math.cos(-Math.PI / 2 + Math.PI / n)}
              y={C.y + (p / 100) * R * Math.sin(-Math.PI / 2 + Math.PI / n) + 3}
              textAnchor="middle"
              fontSize={10}
              fill="var(--muted)"
            >
              {p}
            </text>
          </g>
        ))}
        {metrics.map((m, i) => {
          const [x, y] = at(i, 100);
          // Labels sit outside the 100 ring; `at` clamps to 100, so place them directly.
          const lx = C.x + R * 1.14 * Math.cos(angle(i));
          const ly = C.y + R * 1.14 * Math.sin(angle(i)) + (Math.sin(angle(i)) > 0.5 ? 8 : Math.sin(angle(i)) < -0.5 ? -4 : 0);
          const anchor = Math.abs(lx - C.x) < 8 ? "middle" : lx > C.x ? "start" : "end";
          return (
            <g key={m.key}>
              <line x1={C.x} y1={C.y} x2={x} y2={y} stroke={hover === i ? "var(--muted)" : "var(--line)"} strokeWidth={1} />
              <text x={lx} y={ly + 4} textAnchor={anchor} fontSize={15} fontWeight={hover === i ? 800 : 600} fill="var(--fg)">
                {m.label}
              </text>
            </g>
          );
        })}
        {shapes.map((s) => (
          <g key={s.name}>
            <polygon
              points={s.pcts.map((p, i) => at(i, p ?? 0).join(",")).join(" ")}
              fill={s.color}
              fillOpacity={0.12}
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeDasharray={s.dashed ? "6 4" : undefined}
            />
            {s.pcts.map((p, i) =>
              p === null ? null : (
                <circle key={i} cx={at(i, p)[0]} cy={at(i, p)[1]} r={hover === i ? 5.5 : 4} fill={s.color} stroke="var(--card)" strokeWidth={2} />
              ),
            )}
          </g>
        ))}
        {/* Hit targets: a wedge per spoke, much bigger than the dots. */}
        {metrics.map((m, i) => {
          const a0 = angle(i) - Math.PI / n;
          const a1 = angle(i) + Math.PI / n;
          const rr = R * 1.25;
          return (
            <path
              key={m.key}
              d={`M${C.x},${C.y}L${C.x + rr * Math.cos(a0)},${C.y + rr * Math.sin(a0)}A${rr},${rr} 0 0 1 ${C.x + rr * Math.cos(a1)},${C.y + rr * Math.sin(a1)}Z`}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => setHover(hover === i ? null : i)}
            />
          );
        })}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute left-1/2 top-2 z-10 min-w-44 -translate-x-1/2 rounded-xl border border-line bg-card px-3 py-2 text-xs shadow-lg">
          <div className="mb-1 font-bold text-fg">{metrics[hover].label}</div>
          <div className="mb-1.5 text-muted">{metrics[hover].help}</div>
          {shapes.map((s) => (
            <div key={s.name} className="flex items-center justify-between gap-3 text-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
                {s.name}
              </span>
              <b className="tabular-nums text-fg">
                {formatMetric(metrics[hover], s.values[hover])}
                <span className="font-normal text-muted"> · {s.pcts[hover] === null ? "–" : `${Math.round(s.pcts[hover]!)}th`}</span>
              </b>
            </div>
          ))}
        </div>
      )}
      {/* Legend (identity never by colour alone: the table below names every value too) */}
      <div className="mt-2 flex flex-wrap justify-center gap-4 text-xs font-medium text-muted">
        {shapes.map((s) => (
          <span key={s.name} className="flex items-center gap-1.5">
            <svg width="18" height="8" aria-hidden>
              <line x1="0" y1="4" x2="18" y2="4" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dashed ? "5 3" : undefined} />
            </svg>
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function RadarTable({ metrics, shapes }: { metrics: Metric[]; shapes: Shape[] }) {
  return (
    <div className="mt-5 overflow-x-auto">
      <table className="w-full min-w-[28rem] text-sm">
        <thead className="text-xs uppercase tracking-wide text-muted">
          <tr>
            <th scope="col" className="px-2 py-1.5 text-left">Stat</th>
            {shapes.map((s) => (
              <th key={s.name} scope="col" className="px-2 py-1.5 text-right">
                {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {metrics.map((m, i) => (
            <tr key={m.key}>
              <th scope="row" className="px-2 py-1.5 text-left font-medium" title={m.help}>
                {m.label}
              </th>
              {shapes.map((s) => (
                <td key={s.name} className="px-2 py-1.5 text-right tabular-nums">
                  {formatMetric(m, s.values[i])}
                  <span className="ml-1.5 text-xs text-muted">{s.pcts[i] === null ? "" : `${Math.round(s.pcts[i]!)}th`}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
