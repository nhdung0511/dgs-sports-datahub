import Link from "next/link";
import { SiteShell } from "@/components/site-shell";
import { Flash } from "@/components/news/flash";
import { Paper } from "@/components/news/paper";
import { StatusRow } from "@/components/news/status-row";
import { requireUser } from "@/lib/auth";
import { listMyPosts, type PostListItem } from "@/lib/db/news";
import { getMyTeam } from "@/lib/db/teams";
import type { PostStatus } from "@/lib/news";

type Search = Promise<{ error?: string; submitted?: string; moved?: string; deleted?: string }>;

const GROUPS: { status: PostStatus; title: string; empty: string }[] = [
  { status: "draft", title: "Drafts", empty: "No drafts." },
  { status: "submitted", title: "Waiting for review", empty: "Nothing waiting." },
  { status: "published", title: "Published", empty: "Nothing published yet." },
];

export default async function MyPosts({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser("/news/mine");
  const [member, posts] = await Promise.all([getMyTeam(supabase, user.id), listMyPosts(supabase, user.id)]);
  const isAdmin = member?.role === "admin";
  const now = new Date();
  const by = (s: PostStatus) => posts.filter((p) => p.status === s);

  const actions = (p: PostListItem) => {
    if (p.status === "draft")
      return [
        { label: isAdmin ? "Publish" : "Submit for review", to: isAdmin ? "published" : "submitted", primary: true } as const,
        { label: "Delete", remove: true } as const,
      ];
    if (p.status === "submitted")
      return [
        ...(isAdmin ? [{ label: "Publish", to: "published", primary: true } as const] : []),
        { label: "Back to draft", to: "draft" } as const,
      ];
    return isAdmin ? [{ label: "Unpublish", to: "draft" } as const, { label: "Delete", remove: true } as const] : [];
  };

  return (
    <SiteShell bare>
      <Paper narrow>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="h-page">My posts</h1>
          <Link href="/news/new" className="btn btn-primary">
            Write a post
          </Link>
        </div>
        <div className="mt-6" />
        <Flash sp={sp} />
        {!member ? (
          <p className="text-xl">Only team members can write posts.</p>
        ) : posts.length === 0 ? (
          <p className="text-xl">
            You haven’t written anything yet.{" "}
            <Link href="/news/new" className="underline underline-offset-4">
              Write your first post
            </Link>
          </p>
        ) : (
          GROUPS.map((g) => (
            <section key={g.status} className="mb-10" aria-labelledby={`g-${g.status}`}>
              <h2 id={`g-${g.status}`} className="label mb-3">
                {g.title}
              </h2>
              {by(g.status).length === 0 ? (
                <p className="rule muted border-t py-4">{g.empty}</p>
              ) : (
                <ul>
                  {by(g.status).map((p) => (
                    <StatusRow key={p.id} post={p} actions={actions(p)} back="/news/mine" now={now} />
                  ))}
                </ul>
              )}
            </section>
          ))
        )}
      </Paper>
    </SiteShell>
  );
}
