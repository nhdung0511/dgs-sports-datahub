import Link from "next/link";
import type { GameWithBox } from "@/lib/db/games";

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    live: "bg-opp text-white",
    final: "bg-card-2 text-fg ring-1 ring-line",
    scheduled: "bg-cyan-soft text-fg ring-1 ring-cyan/40",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${map[status] ?? ""}`}>
      {status === "live" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />}
      {status === "scheduled" ? "Upcoming" : status}
    </span>
  );
}

export function formatDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** One row in a games list: score, opponent, status, and links. */
export function GameCard({ item, canScore }: { item: GameWithBox; canScore: boolean }) {
  const { game, box } = item;
  const { us, opp } = box.score;
  const started = game.status !== "scheduled";
  const result = game.status === "final" ? (us > opp ? "W" : us < opp ? "L" : "T") : null;
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-line bg-card p-4 transition hover:border-cyan">
      <Link href={`/g/${game.id}`} className="flex min-w-0 flex-1 items-center gap-4">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-black ${
            result === "W" ? "bg-lime-strong text-black" : result ? "bg-card-2 text-muted" : "bg-brand text-brand-fg"
          }`}
        >
          {result ?? "vs"}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-bold">vs {game.opponentName}</span>
          <span className="text-xs text-muted">{formatDate(game.startsAt)}</span>
        </span>
      </Link>
      {started && (
        <span className="text-2xl font-black tabular-nums">
          {us}
          <span className="mx-1 text-muted">–</span>
          {opp}
        </span>
      )}
      <StatusPill status={game.status} />
      {canScore && game.status !== "final" && (
        <Link
          href={`/games/${game.id}/score`}
          className="rounded-full bg-brand px-3 py-1.5 text-xs font-bold text-brand-fg hover:bg-brand-hover"
        >
          Keep score
        </Link>
      )}
    </li>
  );
}
