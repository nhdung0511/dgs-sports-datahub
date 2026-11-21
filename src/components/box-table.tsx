import { BOX_COLUMNS, type Column } from "@/lib/sports/basketball/columns";
import { emptyLine, type PlayerLine } from "@/lib/sports/basketball/stats";
import type { Player } from "@/lib/sports/types";

/** Box score / season table. Players with no line are hidden unless showAll. */
export function BoxTable({
  players,
  lines,
  columns = BOX_COLUMNS,
  showAll = false,
  extra,
  totals,
  compact = false,
}: {
  players: readonly Player[];
  lines: Record<string, PlayerLine>;
  columns?: Column[];
  showAll?: boolean;
  extra?: { label: string; value: (id: string) => string | number };
  totals?: PlayerLine;
  compact?: boolean;
}) {
  const rows = showAll ? players : players.filter((p) => lines[p.id]);
  const pad = compact ? "px-1.5 py-1" : "px-2 py-2";
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead className="bg-card-2 text-xs text-muted">
          <tr>
            <th className={`${pad} sticky left-0 bg-card-2 text-left`}>Player</th>
            {extra && <th className={`${pad} text-right`}>{extra.label}</th>}
            {columns.map((c) => (
              <th key={c.key} title={c.title} className={`${pad} text-right font-bold`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + 2} className="p-4 text-center text-muted">
                No stats yet.
              </td>
            </tr>
          )}
          {rows.map((p) => {
            const l = lines[p.id] ?? emptyLine();
            return (
              <tr key={p.id} className="border-t border-line">
                <td className={`${pad} sticky left-0 whitespace-nowrap bg-card font-medium`}>
                  <span className="mr-1.5 inline-block w-7 text-right font-black text-muted">
                    {p.jersey ?? "–"}
                  </span>
                  {p.name}
                </td>
                {extra && <td className={`${pad} text-right`}>{extra.value(p.id)}</td>}
                {columns.map((c) => (
                  <td key={c.key} className={`${pad} text-right ${c.key === "pts" ? "font-black" : ""}`}>
                    {c.value(l)}
                  </td>
                ))}
              </tr>
            );
          })}
          {totals && rows.length > 0 && (
            <tr className="border-t-2 border-line bg-card-2 font-bold">
              <td className={`${pad} sticky left-0 bg-card-2`}>Team</td>
              {extra && <td />}
              {columns.map((c) => (
                <td key={c.key} className={`${pad} text-right`}>
                  {c.key === "min" || c.key === "pm" ? "" : c.value(totals)}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
