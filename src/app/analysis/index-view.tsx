"use client";

import { useMemo, useState } from "react";
import { CsvButton } from "@/components/csv-button";
import { UNIT_LABELS } from "@/lib/sports/basketball/advanced";
import { formatMetric, GROUP_LABELS, METRICS, metricByKey, type MetricGroup } from "@/lib/sports/basketball/metrics";
import { metricPercentiles, pctTint, shortName, type ViewProps } from "./shared";

const GROUPS = Object.keys(GROUP_LABELS) as MetricGroup[];

/** DataMB-style "Index": sortable table with percentile-coloured cells. */
export function IndexView({ rows, unit, minMinutes }: ViewProps) {
  const [group, setGroup] = useState<MetricGroup>("shooting");
  const [sortKey, setSortKey] = useState<string>("gameScorePer32");
  const [desc, setDesc] = useState(true);

  const cols = METRICS.filter((m) => m.group === group);
  const rating = metricByKey("gameScorePer32")!;
  const shown = group === "impact" ? cols : [...cols, rating];

  // Percentiles for every metric once, so cells and sorting share them.
  const pcts = useMemo(
    () => Object.fromEntries(METRICS.map((m) => [m.key, metricPercentiles(rows, m, unit, minMinutes)])),
    [rows, unit, minMinutes],
  );

  const sorted = useMemo(() => {
    const m = metricByKey(sortKey);
    const val = (r: (typeof rows)[number]) =>
      sortKey === "min" ? r.adv.minutes : sortKey === "name" ? 0 : m ? m.value(r.agg, r.adv, unit) : null;
    return [...rows].sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1; // low-minute players last
      if (sortKey === "name") return a.player.name.localeCompare(b.player.name) * (desc ? -1 : 1);
      const va = val(a);
      const vb = val(b);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      return desc ? vb - va : va - vb;
    });
  }, [rows, sortKey, desc, unit]);

  function sortBy(key: string) {
    if (key === sortKey) setDesc(!desc);
    else {
      setSortKey(key);
      setDesc(key !== "name");
    }
  }

  const csvRows = () => [
    ["Player", "Number", "GP", "MIN", ...METRICS.map((m) => (m.counting ? `${m.label} (${UNIT_LABELS[unit]})` : m.label))],
    ...rows.map((r) => [
      r.player.name,
      r.player.jersey ?? "",
      r.adv.gp,
      Math.round(r.adv.minutes),
      ...METRICS.map((m) => {
        const v = m.value(r.agg, r.adv, unit);
        return v === null ? "" : Math.round(v * 10) / 10;
      }),
    ]),
  ];

  const Th = ({ k, children, title }: { k: string; children: React.ReactNode; title?: string }) => (
    <th scope="col" className="whitespace-nowrap px-3 py-2 text-right font-bold first:text-left" title={title}>
      <button onClick={() => sortBy(k)} className="inline-flex items-center gap-1 hover:text-fg">
        {children}
        {sortKey === k && <span aria-hidden>{desc ? "▼" : "▲"}</span>}
      </button>
    </th>
  );

  return (
    <section className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Stat groups" className="flex flex-wrap gap-1.5">
          {GROUPS.map((g) => (
            <button
              key={g}
              role="tab"
              aria-selected={group === g}
              onClick={() => setGroup(g)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                group === g ? "bg-fg text-bg" : "bg-card-2 text-muted hover:text-fg"
              }`}
            >
              {GROUP_LABELS[g]}
            </button>
          ))}
        </div>
        <CsvButton filename="dgs-analysis-leaderboard" rows={csvRows} label="CSV (all stats)" />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-separate border-spacing-y-1 text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr>
              <Th k="name">Player</Th>
              <Th k="min">MIN</Th>
              {shown.map((m) => (
                <Th key={m.key} k={m.key} title={m.help}>
                  {m.label}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.player.id} className={r.eligible ? "" : "opacity-45"}>
                <th scope="row" className="whitespace-nowrap rounded-l-lg px-3 py-2 text-left font-bold">
                  {shortName(r.player)}
                  {!r.eligible && <span className="ml-1.5 text-xs font-normal text-muted">(low min)</span>}
                </th>
                <td className="px-3 py-2 text-right tabular-nums text-muted">{Math.round(r.adv.minutes)}</td>
                {shown.map((m) => {
                  const p = pcts[m.key][r.player.id];
                  return (
                    <td
                      key={m.key}
                      className="px-3 py-2 text-right tabular-nums last:rounded-r-lg"
                      style={{ background: pctTint(p) }}
                      title={p === null ? m.help : `${m.label}: ${Math.round(p)}th percentile on the team`}
                    >
                      {formatMetric(m, m.value(r.agg, r.adv, unit))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-6 rounded" style={{ background: pctTint(0) }} /> bottom of team
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-6 rounded border border-line" /> middle
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-6 rounded" style={{ background: pctTint(100) }} /> top of team
        </span>
        <span>Hover a column for what it means. GmSc/32 is the overall rating for now; archetype ratings come in stage 4.</span>
      </div>
    </section>
  );
}
