import { Placeholder } from "@/components/placeholder";

export default async function ScorePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Placeholder
      title={`Scoring — game ${id.slice(0, 8)}`}
      todo={[
        "Tablet-landscape + laptop layout: on-court five on the left, action buttons on the right",
        "Two-tap events (player → action) with keyboard shortcuts on laptop",
        "Game clock start/stop, period start/end, substitutions",
        "Undo last event; editable play-by-play log",
        "Events written to the offline outbox, flushed to Supabase when online",
      ]}
    />
  );
}
