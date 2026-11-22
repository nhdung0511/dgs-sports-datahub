import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteShell } from "@/components/site-shell";
import { Paper } from "@/components/news/paper";
import { PostForm } from "@/components/news/post-form";
import { requireUser } from "@/lib/auth";
import { getPostBySlug } from "@/lib/db/news";
import { getMyTeam } from "@/lib/db/teams";

export default async function EditPost({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const { supabase, user } = await requireUser(`/news/${slug}/edit`);
  const post = await getPostBySlug(supabase, slug);
  if (!post) notFound();
  const member = await getMyTeam(supabase, user.id);
  const isAdmin = member?.role === "admin";
  // Cosmetic mirror of the update policy: authors lose edit rights once a post is published.
  const canEdit = isAdmin || (post.createdBy === user.id && post.status !== "published");

  return (
    <SiteShell bare>
      <Paper>
        <h1 className="h-page mb-2">Edit post</h1>
        <p className="sans mb-8 text-sm">
          <Link href={`/news/${post.slug}`} className="underline underline-offset-4">
            View post
          </Link>
        </p>
        {canEdit ? (
          <PostForm
            saved={sp.saved === "1"}
            isAdmin={isAdmin}
            initial={{
              id: post.id,
              title: post.title,
              summary: post.summary ?? "",
              body: post.body,
              category: post.category,
              authorName: post.authorName,
              status: post.status,
            }}
          />
        ) : (
          <p className="text-xl">This post is published, so only an admin can edit it.</p>
        )}
      </Paper>
    </SiteShell>
  );
}
