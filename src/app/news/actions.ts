"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createPost, deletePost, getPostById, setPostStatus, updatePost, type PostInput } from "@/lib/db/news";
import { getMyTeam } from "@/lib/db/teams";
import { isCategory, type PostStatus } from "@/lib/news";

export interface FormState {
  error?: string;
}

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Postgres messages are for developers; authors get a sentence about what to do. */
function plain(e: unknown): string {
  const m = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : "";
  if (/row-level security|permission denied/i.test(m)) return "You don’t have permission to do that. If the post was published, only an admin can change it.";
  if (/violates check constraint/i.test(m)) return "One of the fields is too long or empty. Check the headline, summary, name and text.";
  return m || "Something went wrong. Try again.";
}

function readInput(f: FormData): PostInput | string {
  const title = text(f, "title");
  const body = String(f.get("body") ?? "").trim();
  const summary = text(f, "summary");
  const authorName = text(f, "authorName");
  const category = text(f, "category");
  if (!title) return "Add a headline.";
  if (title.length > 140) return "Keep the headline under 140 characters.";
  if (summary.length > 300) return "Keep the summary under 300 characters.";
  if (!authorName) return "Add the name to show under “Written by”.";
  if (authorName.length > 80) return "Keep the name under 80 characters.";
  if (!isCategory(category)) return "Choose a category.";
  if (!body) return "Write something in the body.";
  if (body.length > 50000) return "The body is over 50,000 characters. Split it into two posts.";
  return { title, summary: summary || null, body, category, authorName };
}

const refresh = (slug?: string) => {
  revalidatePath("/news");
  revalidatePath("/");
  if (slug) revalidatePath(`/news/${slug}`);
};

const STATUS_FOR: Record<string, PostStatus | undefined> = {
  save: undefined,
  submit: "submitted",
  publish: "published",
  draft: "draft",
  unpublish: "draft",
};

/** Editor submit. `intent` says which button was pressed; RLS, not this function, decides who may. */
export async function savePost(_prev: FormState, form: FormData): Promise<FormState> {
  const id = text(form, "id");
  const intent = text(form, "intent");
  const { supabase, user } = await requireUser(id ? `/news` : "/news/new");
  const input = readInput(form);
  if (typeof input === "string") return { error: input };
  if (!(intent in STATUS_FOR)) return { error: "Unknown action." };
  const status = STATUS_FOR[intent];

  let slug: string;
  try {
    if (id) {
      const existing = await getPostById(supabase, id);
      if (!existing) return { error: "This post no longer exists or you can’t see it." };
      await updatePost(supabase, id, { ...input, ...(status ? { status } : {}) });
      slug = existing.slug;
    } else {
      const team = await getMyTeam(supabase, user.id);
      if (!team) return { error: "Join the team before writing a post." };
      slug = await createPost(supabase, team.id, user.id, input, status ?? "draft");
    }
  } catch (e) {
    return { error: plain(e) };
  }
  refresh(slug);
  if (intent === "publish") redirect(`/news/${slug}`);
  if (intent === "save") redirect(`/news/${slug}/edit?saved=1`);
  redirect(`/news/mine?${intent === "submit" ? "submitted" : "moved"}=1`);
}

/** One-click moves from My posts and the review queue. */
export async function moveToStatus(form: FormData) {
  const { supabase } = await requireUser("/news/mine");
  const id = text(form, "id");
  const to = text(form, "to") as PostStatus;
  const back = text(form, "back") || "/news/mine";
  if (!["draft", "submitted", "published"].includes(to)) redirect(`${back}?error=${encodeURIComponent("Unknown action.")}`);
  try {
    const post = await getPostById(supabase, id);
    await setPostStatus(supabase, id, to);
    refresh(post?.slug);
  } catch (e) {
    redirect(`${back}?error=${encodeURIComponent(plain(e))}`);
  }
  redirect(`${back}?moved=${to}`);
}

export async function removePost(form: FormData) {
  const { supabase } = await requireUser("/news/mine");
  const id = text(form, "id");
  const back = text(form, "back") || "/news/mine";
  try {
    const post = await getPostById(supabase, id);
    await deletePost(supabase, id);
    refresh(post?.slug);
  } catch (e) {
    redirect(`${back}?error=${encodeURIComponent(plain(e))}`);
  }
  redirect(`${back}?deleted=1`);
}
