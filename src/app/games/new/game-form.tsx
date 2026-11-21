"use client";

import { useEffect, useState } from "react";
import { btnAccent, card, input, label } from "@/components/ui";
import { createGame } from "./actions";

const PRESETS = [
  { id: "fiba", name: "FIBA", detail: "4 × 10 min, OT 5", periodCount: 4, periodMinutes: 10, overtimeMinutes: 5 },
  { id: "nba", name: "NBA", detail: "4 × 12 min, OT 5", periodCount: 4, periodMinutes: 12, overtimeMinutes: 5 },
  { id: "hs", name: "High school", detail: "4 × 8 min, OT 4", periodCount: 4, periodMinutes: 8, overtimeMinutes: 4 },
  { id: "ncaa", name: "College", detail: "2 × 20 min, OT 5", periodCount: 2, periodMinutes: 20, overtimeMinutes: 5 },
] as const;

/** Local date-time for the datetime-local input's default value. */
function nowLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function GameForm() {
  const [fmt, setFmt] = useState({ periodCount: 4, periodMinutes: 10, overtimeMinutes: 5 });
  const [when, setWhen] = useState("");
  // Fill "now" after mount so server and browser render the same HTML.
  useEffect(() => setWhen(nowLocal()), []);
  const [pending, setPending] = useState(false);
  const preset = PRESETS.find(
    (p) =>
      p.periodCount === fmt.periodCount &&
      p.periodMinutes === fmt.periodMinutes &&
      p.overtimeMinutes === fmt.overtimeMinutes,
  );

  return (
    <form action={createGame} onSubmit={() => setPending(true)} className={`${card} space-y-6 p-5 sm:p-6`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="opponent" className={label}>
            Opponent
          </label>
          <input id="opponent" name="opponent" required placeholder="e.g. Riverside Hawks" className={input} />
        </div>
        <div>
          <label htmlFor="when" className={label}>
            Date &amp; time
          </label>
          <input
            id="when"
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className={input}
          />
          {/* Converted here so the server stores the right moment regardless of its timezone. */}
          <input type="hidden" name="startsAtIso" value={when ? new Date(when).toISOString() : ""} />
        </div>
      </div>

      <fieldset>
        <legend className={label}>Game format</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setFmt({ periodCount: p.periodCount, periodMinutes: p.periodMinutes, overtimeMinutes: p.overtimeMinutes })}
              className={`rounded-xl border-2 p-3 text-left transition ${
                preset?.id === p.id ? "border-lime bg-lime-soft" : "border-line hover:border-cyan"
              }`}
            >
              <span className="block font-bold">{p.name}</span>
              <span className="text-xs text-muted">{p.detail}</span>
            </button>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="periodCount" className={label}>
              Periods
            </label>
            <select
              id="periodCount"
              name="periodCount"
              value={fmt.periodCount}
              onChange={(e) => setFmt({ ...fmt, periodCount: Number(e.target.value) })}
              className={input}
            >
              <option value={2}>2 halves</option>
              <option value={4}>4 quarters</option>
            </select>
          </div>
          <div>
            <label htmlFor="periodMinutes" className={label}>
              Minutes each
            </label>
            <input
              id="periodMinutes"
              name="periodMinutes"
              type="number"
              min={1}
              max={30}
              value={fmt.periodMinutes}
              onChange={(e) => setFmt({ ...fmt, periodMinutes: Number(e.target.value) })}
              className={input}
            />
          </div>
          <div>
            <label htmlFor="overtimeMinutes" className={label}>
              Overtime min
            </label>
            <input
              id="overtimeMinutes"
              name="overtimeMinutes"
              type="number"
              min={1}
              max={15}
              value={fmt.overtimeMinutes}
              onChange={(e) => setFmt({ ...fmt, overtimeMinutes: Number(e.target.value) })}
              className={input}
            />
          </div>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <p className="text-sm text-muted">You&apos;ll be the scorekeeper. You pick the starting five on the next screen.</p>
        <button disabled={pending} className={btnAccent}>
          {pending ? "Creating…" : "Create game & start scoring →"}
        </button>
      </div>
    </form>
  );
}
