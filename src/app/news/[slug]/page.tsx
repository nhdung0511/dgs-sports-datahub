import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteShell } from "@/components/site-shell";
import { LocalTime } from "@/components/news/local-time";
import { Markdown } from "@/components/news/markdown";
import { Paper } from "@/components/news/paper";
import { HeadlineRow } from "@/components/news/post-row";
import { ShareButton } from "@/components/news/share-button";
import { getSessionUser } from "@/lib/auth";
import { getPostBySlug, listPublishedPosts } from "@/lib/db/news";
import { getMyTeam } from "@/lib/db/teams";
import { categoryLabel, formatNewsDate, keepScores, plainSummary, wasEdited } from "@/lib/news";
import { createClient } from "@/lib/supabase/server";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(await createClient(), slug).catch(() => null);
  // Unpublished posts are only visible to their author/admins; never leak a title into a preview.
  if (!post || post.status !== "published") return { title: "News · DGS Sports Datahub" };
  const description = plainSummary(post);
  const title = `${post.title} · DGS Sports Datahub`;
  return {
    title,
    description,
    openGraph: {
      type: "article",
      title,
      description,
      siteName: "DGS Sports Datahub",
      publishedTime: post.publishedAt ?? undefined,
      authors: [post.authorName],
      images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image", title, description, images: ["/og-default.png"] },
  };
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => Array.from(w)[0]?.toUpperCase())
    .join("");

export default async function PostPage({ params }: { params: Params }) {
  const { slug } = await params;
  const { supabase, user } = await getSessionUser();
  const post = await getPostBySlug(supabase, slug);
  if (!post) notFound();

  const member = user ? await getMyTeam(supabase, user.id) : null;
  const published = post.status === "published";
  const isAdmin = member?.role === "admin";
  const canEditPost = isAdmin || (user?.id === post.createdBy && !published);
  const { posts: more } = await listPublishedPosts(supabase, { limit: 3, excludeSlug: slug });
  const now = new Date();
  const when = post.publishedAt ?? post.createdAt;

  return (
    <SiteShell bare>
      <Paper narrow>
        <article>
          {!published && (
            <p className="sans mb-6 border px-4 py-3 text-[13px] rule">
              {post.status === "draft" ? "Draft" : "Waiting for review"}. Only you and team admins can see this.
            </p>
          )}
          <p className="label">
            <Link href={`/news?category=${post.category}`} className="hover:underline">
              {categoryLabel(post.category)}
            </Link>
          </p>
          <h1 className="h-article mt-4">{keepScores(post.title)}</h1>
          {post.summary && <p className="dek mt-3">{post.summary}</p>}

          <div className="mt-6 flex items-center gap-3">
            <span
              aria-hidden
              className="sans flex size-10 flex-none items-center justify-center rounded-full text-sm font-semibold"
              style={{ background: "var(--news-fill)" }}
            >
              {initials(post.authorName)}
            </span>
            <div className="sans">
              <p className="text-sm leading-[1.3]">
                By <span className="font-semibold">{post.authorName}</span>
              </p>
              <p className="tnum muted flex flex-wrap items-center text-[13px] leading-[1.3]">
                <time dateTime={when}>{formatNewsDate(when, now)}</time>
                {published && wasEdited(post.publishedAt, post.updatedAt) && (
                  <>
                    <span aria-hidden className="mx-2 inline-block h-3 w-px" style={{ background: "var(--news-rule)" }} />
                    <LocalTime iso={post.updatedAt} prefix="Updated" />
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
            <ShareButton title={post.title} />
            {canEditPost && (
              <Link href={`/news/${post.slug}/edit`} className="sans inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">
                Edit post
              </Link>
            )}
          </div>

          <hr className="rule mb-8 mt-6 border-t" />
          <Markdown>{post.body}</Markdown>
        </article>

        <footer className="rule mt-12 border-t pt-8">
          <Link href={`/news?category=${post.category}`} className="pill">
            {categoryLabel(post.category)}
          </Link>
          {more.length > 0 && (
            <section aria-labelledby="read-next" className="mt-8">
              <h2 id="read-next" className="label mb-4">
                Read next
              </h2>
              <ul>
                {more.map((p) => (
                  <HeadlineRow key={p.id} post={p} now={now} />
                ))}
              </ul>
            </section>
          )}
        </footer>
      </Paper>
    </SiteShell>
  );
}
