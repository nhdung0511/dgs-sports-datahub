import type { SupabaseClient } from "@supabase/supabase-js";
import { plainSummary, slugify, type Category, type PostStatus } from "@/lib/news";
import type { GameWithBox } from "./games";

export interface NewsItem {
  id: string;
  kind: "post" | "result";
  title: string;
  body: string;
  date: string;
  href?: string;
}

export interface Post {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  body: string;
  category: Category;
  status: PostStatus;
  authorName: string;
  createdBy: string;
  publishedAt: string | null;
  updatedAt: string;
  createdAt: string;
}

/** List rows never carry the body (it can be 50 000 chars); `excerpt` is the dek or body start. */
export type PostListItem = Omit<Post, "body"> & { excerpt: string };

interface Row {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  body?: string;
  category: Category;
  status: PostStatus;
  author_name: string;
  created_by: string;
  published_at: string | null;
  updated_at: string;
  created_at: string;
}

const LIST_COLS = "id, slug, title, summary, category, status, author_name, created_by, published_at, updated_at, created_at";
const FULL_COLS = `${LIST_COLS}, body`;

const toPost = (r: Row): Post => ({
  id: r.id,
  slug: r.slug,
  title: r.title,
  summary: r.summary,
  body: r.body ?? "",
  category: r.category,
  status: r.status,
  authorName: r.author_name,
  createdBy: r.created_by,
  publishedAt: r.published_at,
  updatedAt: r.updated_at,
  createdAt: r.created_at,
});

const toListItem = (r: Row): PostListItem => {
  const { body: _body, ...rest } = toPost(r);
  void _body;
  return { ...rest, excerpt: r.summary ?? "" };
};

export const NEWS_PAGE_SIZE = 20;
const RESERVED_SLUGS = new Set(["new", "mine", "review", "edit"]);

/** Published posts, newest first. Asks for one extra row so the page can tell if there is an older page. */
export async function listPublishedPosts(
  supabase: SupabaseClient,
  opts: { category?: Category; limit?: number; offset?: number; excludeSlug?: string } = {},
): Promise<{ posts: PostListItem[]; hasMore: boolean }> {
  const limit = opts.limit ?? NEWS_PAGE_SIZE;
  const offset = opts.offset ?? 0;
  let q = supabase
    .from("news_posts")
    .select(LIST_COLS)
    // RLS also lets authors/admins read their own drafts; public lists must never show them.
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .range(offset, offset + limit);
  if (opts.category) q = q.eq("category", opts.category);
  if (opts.excludeSlug) q = q.neq("slug", opts.excludeSlug);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data as Row[]).map(toListItem);
  return { posts: rows.slice(0, limit), hasMore: rows.length > limit };
}

/** Null when the slug doesn't exist or RLS hides it from this viewer. */
export async function getPostBySlug(supabase: SupabaseClient, slug: string): Promise<Post | null> {
  const { data, error } = await supabase.from("news_posts").select(FULL_COLS).eq("slug", slug).maybeSingle();
  if (error) throw error;
  return data ? toPost(data as Row) : null;
}

export async function getPostById(supabase: SupabaseClient, id: string): Promise<Post | null> {
  // Non-UUID ids make Postgres throw (see PLAN gotchas).
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await supabase.from("news_posts").select(FULL_COLS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toPost(data as Row) : null;
}

export async function listMyPosts(supabase: SupabaseClient, userId: string): Promise<PostListItem[]> {
  const { data, error } = await supabase
    .from("news_posts")
    .select(LIST_COLS)
    .eq("created_by", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as Row[]).map(toListItem);
}

/** Submitted posts, oldest first so nobody waits behind newer work. */
export async function listReviewQueue(supabase: SupabaseClient, teamId: string): Promise<PostListItem[]> {
  const { data, error } = await supabase
    .from("news_posts")
    .select(LIST_COLS)
    .eq("team_id", teamId)
    .eq("status", "submitted")
    .order("updated_at", { ascending: true });
  if (error) throw error;
  return (data as Row[]).map(toListItem);
}

export interface PostInput {
  title: string;
  summary: string | null;
  body: string;
  category: Category;
  authorName: string;
}

/** Inserts with slugify(title); on a unique violation retries with -2, -3, … */
export async function createPost(
  supabase: SupabaseClient,
  teamId: string,
  userId: string,
  input: PostInput,
  status: "draft" | "submitted" | "published",
): Promise<string> {
  // /news/new, /news/mine and /news/review are real routes; a post with that slug would be unreachable.
  const slugged = slugify(input.title);
  const base = RESERVED_SLUGS.has(slugged) ? `${slugged}-post` : slugged;
  for (let n = 1; n <= 20; n++) {
    const slug = n === 1 ? base : `${base.slice(0, 56)}-${n}`;
    const { data, error } = await supabase
      .from("news_posts")
      .insert({
        team_id: teamId,
        created_by: userId,
        slug,
        title: input.title,
        summary: input.summary,
        body: input.body,
        category: input.category,
        author_name: input.authorName,
        status,
      })
      .select("slug")
      .single();
    if (!error) return (data as { slug: string }).slug;
    if (error.code !== "23505") throw error;
  }
  throw new Error("Couldn't find a free URL for this headline. Change the headline and try again.");
}

/** RLS decides who may; a hidden row updates zero rows, which we surface as an error. */
export async function updatePost(
  supabase: SupabaseClient,
  id: string,
  input: Partial<PostInput> & { status?: PostStatus },
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.summary !== undefined) patch.summary = input.summary;
  if (input.body !== undefined) patch.body = input.body;
  if (input.category !== undefined) patch.category = input.category;
  if (input.authorName !== undefined) patch.author_name = input.authorName;
  if (input.status !== undefined) patch.status = input.status;
  const { data, error } = await supabase.from("news_posts").update(patch).eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("You can't change this post. It may have been published or removed.");
}

export const setPostStatus = (supabase: SupabaseClient, id: string, status: PostStatus) =>
  updatePost(supabase, id, { status });

export async function deletePost(supabase: SupabaseClient, id: string): Promise<void> {
  const { data, error } = await supabase.from("news_posts").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("You can't delete this post.");
}

/** Home page: published posts as news items that link to their page. */
export async function listNewsPosts(supabase: SupabaseClient, teamId: string, limit = 6): Promise<NewsItem[]> {
  const { data, error } = await supabase
    .from("news_posts")
    .select("id, slug, title, summary, body, published_at, created_at")
    .eq("team_id", teamId)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (
    data as { id: string; slug: string; title: string; summary: string | null; body: string; published_at: string | null; created_at: string }[]
  ).map((r) => ({
    id: r.id,
    kind: "post",
    title: r.title,
    body: plainSummary(r),
    date: r.published_at ?? r.created_at,
    href: `/news/${r.slug}`,
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
