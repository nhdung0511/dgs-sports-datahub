"use client";

import { useState } from "react";

/**
 * Small hand-rolled SVG charts. Colours come from the validated --series-* tokens,
 * text always uses text tokens, and every chart has a hover tooltip + legend.
 */

export interface Series {
  name: string;
  /** CSS colour, e.g. "var(--series-1)". */
  color: string;
  values: (number | null)[];
}

const W = 640;
const H = 260;
const M = { top: 16, right: 56, bottom: 30, left: 40 };
const IW = W - M.left - M.right;
const IH = H - M.top - M.bottom;

function niceMax(v: number) {
  if (v <= 0) return 10;
  const step = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / step) * step;
}

/** Bar with 4px rounded top, flat on the baseline. */
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export function Legend({ series }: { series: Series[] }) {
  return (
    <div className="flex flex-wrap gap-4 text-xs font-medium text-muted">
      {series.map((s) => (
        <span key={s.name} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
          {s.name}
        </span>
      ))}
    </div>
  );
}

function Tooltip({ x, title, rows, unit }: { x: number; title: string; rows: { s: Series; v: number | null }[]; unit: string }) {
  const left = ((M.left + x) / W) * 100;
  return (
    <div
      className="pointer-events-none absolute top-2 z-10 min-w-32 rounded-xl border border-line bg-card px-3 py-2 text-xs shadow-lg"
      style={{ left: `${left}%`, transform: `translateX(${left > 60 ? "-105%" : "5%"})` }}
    >
      <div className="mb-1 font-bold text-fg">{title}</div>
      {rows.map(({ s, v }) => (
        <div key={s.name} className="flex items-center justify-between gap-3 text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
            {s.name}
          </span>
          <b className="text-fg tabular-nums">{v === null ? "–" : `${v}${unit}`}</b>
        </div>
      ))}
    </div>
  );
}

function Axes({ max, unit }: { max: number; unit: string }) {
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  return (
    <g>
      {ticks.map((t) => {
        const y = M.top + IH - (t / max) * IH;
        return (
          <g key={t}>
            <line x1={M.left} x2={M.left + IW} y1={y} y2={y} stroke="var(--line)" strokeWidth={1} />
            <text x={M.left - 8} y={y + 4} textAnchor="end" fontSize={11} fill="var(--muted)">
              {Math.round(t)}
              {unit}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export function GroupedBarChart({
  categories,
  series,
  unit = "",
  label,
}: {
  categories: string[];
  series: Series[];
  unit?: string;
  label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(...series.flatMap((s) => s.values.map((v) => v ?? 0))));
  const group = IW / categories.length;
  const barW = Math.min(36, (group * 0.6) / series.length);
  const gap = 2;
  const groupW = barW * series.length + gap * (series.length - 1);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
        <Axes max={max} unit={unit} />
        {categories.map((c, i) => {
          const gx = M.left + i * group + (group - groupW) / 2;
          return (
            <g key={c}>
              {hover === i && (
                <rect x={M.left + i * group} y={M.top} width={group} height={IH} fill="var(--card-2)" />
              )}
              {series.map((s, si) => {
                const v = s.values[i] ?? 0;
                const h = (v / max) * IH;
                return (
                  <path
                    key={s.name}
                    d={barPath(gx + si * (barW + gap), M.top + IH - h, barW, Math.max(h, 0.01))}
                    fill={s.color}
                  />
                );
              })}
              <text x={M.left + i * group + group / 2} y={H - 8} textAnchor="middle" fontSize={12} fill="var(--muted)">
                {c}
              </text>
              {/* Hit target: the whole column, bigger than the bars. */}
              <rect
                x={M.left + i * group}
                y={M.top}
                width={group}
                height={IH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onClick={() => setHover(hover === i ? null : i)}
              />
            </g>
          );
        })}
        <line x1={M.left} x2={M.left + IW} y1={M.top + IH} y2={M.top + IH} stroke="var(--muted)" strokeWidth={1} />
      </svg>
      {hover !== null && (
        <Tooltip
          x={hover * group + group / 2}
          title={categories[hover]}
          rows={series.map((s) => ({ s, v: s.values[hover] }))}
          unit={unit}
        />
      )}
    </div>
  );
}

export function LineChart({
  labels,
  series,
  unit = "",
  max: fixedMax,
  label,
  directLabels = true,
}: {
  labels: string[];
  series: Series[];
  unit?: string;
  max?: number;
  label: string;
  /** Name each line at its end. Turn off when a legend is shown and names are long. */
  directLabels?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = fixedMax ?? niceMax(Math.max(...series.flatMap((s) => s.values.map((v) => v ?? 0))));
  const step = labels.length > 1 ? IW / (labels.length - 1) : 0;
  const x = (i: number) => M.left + (labels.length > 1 ? i * step : IW / 2);
  const y = (v: number) => M.top + IH - (v / max) * IH;
  const every = Math.ceil(labels.length / 8); // keep x labels from colliding

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={label}
        onMouseLeave={() => setHover(null)}
      >
        <Axes max={max} unit={unit} />
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={M.top + IH} stroke="var(--muted)" strokeDasharray="3 3" />
        )}
        {series.map((s) => {
          const pts = s.values.map((v, i) => (v === null ? null : ([x(i), y(v)] as const)));
          let d = "";
          pts.forEach((p, i) => {
            if (!p) return;
            d += `${d && pts[i - 1] ? "L" : "M"}${p[0]},${p[1]}`;
          });
          const lastIdx = s.values.reduce<number>((acc, v, i) => (v === null ? acc : i), -1);
          return (
            <g key={s.name}>
              <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {pts.map((p, i) =>
                p ? (
                  <circle
                    key={i}
                    cx={p[0]}
                    cy={p[1]}
                    r={hover === i ? 5 : 4}
                    fill={s.color}
                    stroke="var(--card)"
                    strokeWidth={2}
                  />
                ) : null,
              )}
              {/* Direct label at the line end only. */}
              {directLabels && lastIdx >= 0 && (
                <text x={x(lastIdx) + 8} y={y(s.values[lastIdx]!) + 4} fontSize={11} fontWeight={700} fill="var(--fg)">
                  {s.name}
                </text>
              )}
            </g>
          );
        })}
        {labels.map((l, i) =>
          i % every === 0 || i === labels.length - 1 ? (
            <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--muted)">
              {l}
            </text>
          ) : null,
        )}
        {labels.map((_, i) => (
          <rect
            key={i}
            x={x(i) - Math.max(step, 24) / 2}
            y={M.top}
            width={Math.max(step, 24)}
            height={IH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onClick={() => setHover(hover === i ? null : i)}
          />
        ))}
        <line x1={M.left} x2={M.left + IW} y1={M.top + IH} y2={M.top + IH} stroke="var(--muted)" strokeWidth={1} />
      </svg>
      {hover !== null && (
        <Tooltip
          x={x(hover) - M.left}
          title={labels[hover]}
          rows={series.map((s) => ({ s, v: s.values[hover] }))}
          unit={unit}
        />
      )}
    </div>
  );
}
