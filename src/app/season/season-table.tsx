"use client";

import { useState } from "react";
import { BoxTable } from "@/components/box-table";
import { CsvButton } from "@/components/csv-button";
import { AVG_COLUMNS, BOX_COLUMNS, boxScoreRows } from "@/lib/sports/basketball/columns";
import { perGame, type SeasonLine } from "@/lib/sports/basketball/season";
import type { PlayerLine } from "@/lib/sports/basketball/stats";
import type { Player } from "@/lib/sports/types";

export function SeasonTable({
  players,
  totals,
  filename,
}: {
  players: Player[];
  totals: Record<string, SeasonLine>;
  filename: string;
}) {
  const [mode, setMode] = useState<"avg" | "total">("avg");
  const lines: Record<string, PlayerLine> =
    mode === "avg"
      ? Object.fromEntries(Object.entries(totals).map(([id, l]) => [id, perGame(l)]))
      : totals;
  const columns = mode === "avg" ? AVG_COLUMNS : BOX_COLUMNS;
  // Leading scorers first.
  const sorted = [...players].sort((a, b) => (lines[b.id]?.pts ?? -1) - (lines[a.id]?.pts ?? -1));
  const gp = { label: "GP", value: (id: string) => totals[id]?.gp ?? 0 };

  return (
    <section className="rounded-2xl border border-line bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-2">
        {(["avg", "total"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
              mode === m ? "bg-brand text-brand-fg" : "text-muted hover:bg-card-2"
            }`}
          >
            {m === "avg" ? "Per game" : "Totals"}
          </button>
        ))}
        <div className="ml-auto">
          <CsvButton
            filename={`${filename}-${mode === "avg" ? "per-game" : "totals"}`}
            rows={() => boxScoreRows(sorted, lines, columns, [gp])}
          />
        </div>
      </div>
      <BoxTable players={sorted} lines={lines} columns={columns} extra={gp} />
    </section>
  );
}
