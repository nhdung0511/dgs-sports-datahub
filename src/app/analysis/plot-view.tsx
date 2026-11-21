"use client";

import { useMemo, useRef, useState } from "react";
import { btnGhost, input, label } from "@/components/ui";
import { saveSvgAsPng } from "@/lib/save-png";
import { formatMetric, GROUP_LABELS, METRICS, metricByKey, type Metric } from "@/lib/sports/basketball/metrics";
import { shortName, type ViewProps } from "./shared";

const W = 680;
const H = 460;
const M = { top: 20, right: 24, bottom: 52, left: 64 };
const IW = W - M.left - M.right;
const IH = H - M.top - M.bottom;

/** "Nice" axis ticks covering [lo, hi]. */
function ticks(lo: number, hi: number, count = 5) {
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const raw = (hi - lo) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s >= raw) ?? raw;
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const out: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

const median = (vals: number[]) => {
  const s = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

function MetricSelect({ id, text, value, onChange, allowNone }: { id: string; text: string; value: string; onChange: (v: string) => void; allowNone?: boolean }) {
  return (
    <div>
      <label htmlFor={id} className={label}>
        {text}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={input}>
        {allowNone && <option value="">None</option>}
        {(Object.keys(GROUP_LABELS) as (keyof typeof GROUP_LABELS)[]).map((g) => (
          <optgroup key={g} label={GROUP_LABELS[g]}>
            {METRICS.filter((m) => m.group === g).map((m) => (
              <option key={m.key} value={m.key}>
                {m.label} — {m.help}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

/** Two stats against each other (plus optional dot size), one dot per player, with team-median lines. */
export function PlotView({ rows, unit }: ViewProps) {
  const [xKey, setXKey] = useState("usgPct");
  const [yKey, setYKey] = useState("tsPct");
  const [sizeKey, setSizeKey] = useState("");
  const [showLow, setShowLow] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const xm = metricByKey(xKey) as Metric;
  const ym = metricByKey(yKey) as Metric;
  const sm = sizeKey ? metricByKey(sizeKey) : undefined;

  const pts = useMemo(
    () =>
      rows
        .filter((r) => r.eligible || showLow)
        .map((r) => ({
          r,
          x: xm.value(r.agg, r.adv, unit),
          y: ym.value(r.agg, r.adv, unit),
          s: sm ? sm.value(r.agg, r.adv, unit) : null,
        }))
        .filter((p): p is typeof p & { x: number; y: number } => p.x !== null && p.y !== null),
    [rows, showLow, xm, ym, sm, unit],
  );
  const missing = rows.filter((r) => r.eligible || showLow).length - pts.length;

  const controls = (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <MetricSelect id="p-x" text="Across (x)" value={xKey} onChange={setXKey} />
      <MetricSelect id="p-y" text="Up (y)" value={yKey} onChange={setYKey} />
      <MetricSelect id="p-s" text="Dot size" value={sizeKey} onChange={setSizeKey} allowNone />
      <div className="flex flex-col justify-end gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showLow} onChange={(e) => setShowLow(e.target.checked)} />
          Show low-minute players
        </label>
        <button
          className={btnGhost}
          disabled={pts.length === 0}
          onClick={() => svgRef.current && saveSvgAsPng(svgRef.current, `dgs-plot-${xKey}-vs-${yKey}`)}
        >
          ⤓ Save as image
        </button>
      </div>
    </div>
  );

  if (pts.length === 0) {
    return (
      <section className="rounded-2xl border border-line bg-card p-4 sm:p-5">
        {controls}
        <p className="rounded-xl bg-card-2 p-6 text-center text-sm text-muted">
          No players have both of these stats yet. Stats marked as needing opponent data only come from games recorded with the
          opponent buttons.
        </p>
      </section>
    );
  }

  const xt = ticks(Math.min(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.x)));
  const yt = ticks(Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.y)));
  const sx = (v: number) => M.left + ((v - xt[0]) / (xt[xt.length - 1] - xt[0])) * IW;
  const sy = (v: number) => M.top + IH - ((v - yt[0]) / (yt[yt.length - 1] - yt[0])) * IH;
  const sizes = pts.map((p) => p.s).filter((v): v is number => v !== null);
  const sMax = Math.max(1e-9, ...sizes.map(Math.abs));
  const radius = (v: number | null) => (sm && v !== null ? 6 + 12 * Math.sqrt(Math.abs(v) / sMax) : 7);
  // Medians come from eligible players (everyone shown, if none are eligible).
  const medianPool = pts.some((p) => p.r.eligible) ? pts.filter((p) => p.r.eligible) : pts;
  const mx = median(medianPool.map((p) => p.x));
  const my = median(medianPool.map((p) => p.y));
  const hp = pts.find((p) => p.r.player.id === hover);

  // Direct labels: right of the dot, or left near the right edge; nudge apart any that collide.
  const labels = new Map<string, { x: number; y: number; anchor: "start" | "end" }>();
  const placed: { x: number; y: number; w: number }[] = [];
  for (const p of [...pts].sort((a, b) => sy(a.y) - sy(b.y))) {
    const r = radius(p.s);
    const text = shortName(p.r.player);
    const w = text.length * 6.5;
    const left = sx(p.x) + r + 4 + w > W - 4;
    const x = left ? sx(p.x) - r - 4 : sx(p.x) + r + 4;
    let y = sy(p.y) + 4;
    const x0 = left ? x - w : x;
    for (const o of placed) if (Math.abs(o.y - y) < 13 && x0 < o.x + o.w && o.x < x0 + w) y = o.y + 13;
    placed.push({ x: x0, y, w });
    labels.set(p.r.player.id, { x, y, anchor: left ? "end" : "start" });
  }

  return (
    <section className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      {controls}
      <h2 className="mb-1 text-sm font-bold">
        {ym.label} vs {xm.label}
        {sm && <span className="font-normal text-muted"> · dot size: {sm.label}</span>}
      </h2>
      <div className="relative">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${ym.label} against ${xm.label}`}>
          {xt.map((t) => (
            <g key={`x${t}`}>
              <line x1={sx(t)} x2={sx(t)} y1={M.top} y2={M.top + IH} stroke="var(--line)" />
              <text x={sx(t)} y={M.top + IH + 18} textAnchor="middle" fontSize={11} fill="var(--muted)">
                {formatMetric(xm, t)}
              </text>
            </g>
          ))}
          {yt.map((t) => (
            <g key={`y${t}`}>
              <line x1={M.left} x2={M.left + IW} y1={sy(t)} y2={sy(t)} stroke="var(--line)" />
              <text x={M.left - 8} y={sy(t) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">
                {formatMetric(ym, t)}
              </text>
            </g>
          ))}
          <text x={M.left + IW / 2} y={H - 8} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--fg)">
            {xm.label} →
          </text>
          <text transform={`translate(16 ${M.top + IH / 2}) rotate(-90)`} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--fg)">
            {ym.label} →
          </text>
          {/* Team medians */}
          <line x1={sx(mx)} x2={sx(mx)} y1={M.top} y2={M.top + IH} stroke="var(--muted)" strokeDasharray="4 4" />
          <line x1={M.left} x2={M.left + IW} y1={sy(my)} y2={sy(my)} stroke="var(--muted)" strokeDasharray="4 4" />
          <text x={sx(mx) + 4} y={M.top + 12} fontSize={10} fill="var(--muted)">
            team median
          </text>

          {pts.map((p) => {
            const r = radius(p.s);
            return (
              <g key={p.r.player.id} opacity={p.r.eligible ? 1 : 0.45}>
                <circle
                  cx={sx(p.x)}
                  cy={sy(p.y)}
                  r={hover === p.r.player.id ? r + 1.5 : r}
                  fill="var(--player-1)"
                  fillOpacity={sm ? 0.75 : 1}
                  stroke="var(--card)"
                  strokeWidth={2}
                />
                <text
                  x={labels.get(p.r.player.id)!.x}
                  y={labels.get(p.r.player.id)!.y}
                  textAnchor={labels.get(p.r.player.id)!.anchor}
                  fontSize={11}
                  fontWeight={600}
                  fill="var(--fg)"
                >
                  {shortName(p.r.player)}
                </text>
                <circle
                  cx={sx(p.x)}
                  cy={sy(p.y)}
                  r={Math.max(r + 8, 16)}
                  fill="transparent"
                  onMouseEnter={() => setHover(p.r.player.id)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => setHover(hover === p.r.player.id ? null : p.r.player.id)}
                />
              </g>
            );
          })}
        </svg>
        {hp && (
          <div
            className="pointer-events-none absolute z-10 min-w-40 rounded-xl border border-line bg-card px-3 py-2 text-xs shadow-lg"
            style={{
              left: `${(sx(hp.x) / W) * 100}%`,
              top: `${(sy(hp.y) / H) * 100}%`,
              transform: `translate(${sx(hp.x) > W * 0.6 ? "-110%" : "12px"}, -50%)`,
            }}
          >
            <div className="mb-1 font-bold text-fg">{hp.r.player.name}</div>
            {[
              [xm, hp.x],
              [ym, hp.y],
              ...(sm ? [[sm, hp.s] as const] : []),
            ].map(([m, v]) => (
              <div key={(m as Metric).key} className="flex justify-between gap-3 text-muted">
                <span>{(m as Metric).label}</span>
                <b className="tabular-nums text-fg">{formatMetric(m as Metric, v as number | null)}</b>
              </div>
            ))}
            <div className="flex justify-between gap-3 text-muted">
              <span>Minutes</span>
              <b className="tabular-nums text-fg">{Math.round(hp.r.adv.minutes)}</b>
            </div>
          </div>
        )}
      </div>
      <p className="mt-2 text-xs text-muted">
        Dashed lines are the team medians: top-right means above the team on both. {missing > 0 && `${missing} player(s) without these stats aren't shown.`}
      </p>
    </section>
  );
}
