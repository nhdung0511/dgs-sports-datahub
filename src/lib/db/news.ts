import type { SupabaseClient } from "@supabase/supabase-js";
import type { GameWithBox } from "./games";

export interface NewsItem {
  id: string;
  kind: "post" | "result";
  title: string;
  body: string;
  date: string;
  href?: string;
}

interface PostRow {
  id: string;
  title: string;
  body: string;
  created_at: string;
}

export async function listNewsPosts(supabase: SupabaseClient, teamId: string, limit = 6): Promise<NewsItem[]> {
  const { data, error } = await supabase
    .from("news_posts")
    .select("id, title, body, created_at")
    .eq("team_id", teamId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as PostRow[]).map((r) => ({
    id: r.id,
    kind: "post",
    title: r.title,
    body: r.body,
    date: r.created_at,
  }));
}

/** Turns finished games into automatic news items ("Won 68–54 vs Hawks"). */
export function resultNews(
  games: readonly GameWithBox[],
  nameOf: (playerId: string) => string,
  teamName: string,
): NewsItem[] {
  return games
    .filter((g) => g.game.status === "final")
    .map(({ game, box }) => {
      const { us, opp } = box.score;
      const verb = us > opp ? "beat" : us < opp ? "fell to" : "tied";
      const top = Object.entries(box.players).sort((a, b) => b[1].pts - a[1].pts)[0];
      const leader = top && top[1].pts > 0 ? `${nameOf(top[0])} led the way with ${top[1].pts} points.` : "";
      return {
        id: `result-${game.id}`,
        kind: "result" as const,
        title: `${teamName} ${verb} ${game.opponentName} ${us}–${opp}`,
        body: leader || "Full box score and play-by-play available.",
        date: game.startsAt ?? new Date(0).toISOString(),
        href: `/g/${game.id}`,
      };
    });
}
