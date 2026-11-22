export const CATEGORIES = [
  { value: "recap", label: "Game recap" },
  { value: "analysis", label: "Analysis" },
  { value: "news", label: "News" },
  { value: "opinion", label: "Opinion" },
] as const;

export type Category = (typeof CATEGORIES)[number]["value"];
export type PostStatus = "draft" | "submitted" | "published";

export const STATUS_LABEL: Record<PostStatus, string> = {
  draft: "Draft",
  submitted: "Waiting for review",
  published: "Published",
};

export const isCategory = (v: unknown): v is Category => CATEGORIES.some((c) => c.value === v);

export const categoryLabel = (v: string): string => CATEGORIES.find((c) => c.value === v)?.label ?? "News";

/**
 * Slug from a title. The SQL slugify is ASCII-only and would silently drop Vietnamese letters,
 * so transliterate here first (NFD strips combining marks; đ/Đ have no decomposition).
 */
export function slugify(title: string): string {
  const s = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return s || "post";
}

// Intl gives "Nov 21" with no period and "Sep"; AP style abbreviates only some months.
const AP_MONTHS = ["Jan.", "Feb.", "March", "April", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];

/** "Nov. 21, 2026"; inside the last 24 hours (and `relative`) "3h ago" / "42m ago". */
export function formatNewsDate(iso: string, now: Date = new Date(), relative = false): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const ms = now.getTime() - d.getTime();
  if (relative && ms >= 0 && ms < 24 * 3600_000) {
    const mins = Math.floor(ms / 60_000);
    return mins < 60 ? `${Math.max(mins, 1)}m ago` : `${Math.floor(mins / 60)}h ago`;
  }
  return `${AP_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** True when the post was changed more than an hour after it went live (drives "Updated 8:48 pm"). */
export function wasEdited(publishedAt: string | null, updatedAt: string): boolean {
  if (!publishedAt) return false;
  return new Date(updatedAt).getTime() - new Date(publishedAt).getTime() > 60 * 60_000;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(/\s?([AP])M/, (_, p) => ` ${p.toLowerCase()}m`);
}

/** Markdown to plain text, enough for a dek or Open Graph description. */
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_`~]/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The author's summary, else the first ~160 characters of the body cut at a word boundary. */
export function plainSummary(post: { summary?: string | null; body: string }, max = 160): string {
  if (post.summary?.trim()) return post.summary.trim();
  const text = stripMarkdown(post.body);
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 1)).replace(/[.,;:!?-]+$/, "")}…`;
}

/** Word joiners around an en dash between digits so "68–64" never wraps in a headline. */
export const keepScores = (t: string): string => t.replace(/(\d)–(\d)/g, "$1\u2060–\u2060$2");
