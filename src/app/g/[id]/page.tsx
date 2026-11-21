import { Placeholder } from "@/components/placeholder";

/** Public, no-login game page — the link shared with fans. */
export default async function PublicGamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Placeholder
      title={`Live game ${id.slice(0, 8)}`}
      todo={[
        "Scoreboard with score by period and team fouls",
        "Box score and play-by-play",
        "Live updates via Supabase Realtime on game_events",
        "CSV export of box score and play-by-play",
      ]}
    />
  );
}
