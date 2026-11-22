import Link from "next/link";
import { SiteShell } from "@/components/site-shell";
import { HeadlineRow, LeadStory, PostRow } from "@/components/news/post-row";
import { Paper } from "@/components/news/paper";
import { NewsToolbar } from "@/components/news/toolbar";
import { getSessionUser } from "@/lib/auth";
import { listPublishedPosts, listReviewQueue, NEWS_PAGE_SIZE } from "@/lib/db/news";
import { getMyTeam } from "@/lib/db/teams";
import { CATEGORIES, categoryLabel, isCategory } from "@/lib/news";
import { isSupabaseConfigured } from "@/lib/supabase/env";

type Search = Promise<{ category?: string; page?: string }>;

export default async function NewsPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const category = isCategory(sp.category) ? sp.category : undefined;
  const page = Math.max(1, Math.floor(Number(sp.page)) || 1);
  const href = (c?: string, p = 1) => {
    const q = new URLSearchParams();
    if (c) q.set("category", c);
    if (p > 1) q.set("page", String(p));
    return q.size ? `/news?${q}` : "/news";
  };

  const { supabase, user } = await getSessionUser();
  const [member, { posts, hasMore }] = await Promise.all([
    user ? getMyTeam(supabase, user.id) : null,
    listPublishedPosts(supabase, { category, offset: (page - 1) * NEWS_PAGE_SIZE }),
  ]);
  const queued = member?.role === "admin" ? (await listReviewQueue(supabase, member.id)).length : 0;
  const now = new Date();
  const [lead, ...rest] = posts;

  return (
    <SiteShell bare>
      <Paper>
        <header className="flex flex-wrap items-end justify-between gap-x-8">
          <div>
            <h1 className="h-page">News</h1>
            <p className="sans muted mt-3 text-[15px]">Recaps, analysis and news from the DGS Sports Data Analytics Club.</p>
          </div>
          {member && <NewsToolbar isAdmin={member.role === "admin"} queued={queued} />}
        </header>

        <nav aria-label="Categories" className="rule mt-6 border-t">
          <div className="tabs">
            {[{ value: undefined, label: "All" }, ...CATEGORIES].map((c) => (
              <Link key={c.label} href={href(c.value)} className="tab" aria-current={c.value === category ? "page" : undefined}>
                {c.label}
              </Link>
            ))}
          </div>
        </nav>
        <div className="rule border-t" />

        {!isSupabaseConfigured || !lead ? (
          <div className="py-12">
            <p className="text-xl">
              {page > 1 ? "No older posts." : category ? `No ${categoryLabel(category).toLowerCase()} posts yet.` : "Nothing published yet."}
            </p>
            <p className="sans mt-3 text-[15px]">
              {category || page > 1 ? (
                <Link href="/news" className="underline underline-offset-4">
                  See all news
                </Link>
              ) : member ? (
                <Link href="/news/new" className="underline underline-offset-4">
                  Write the first post
                </Link>
              ) : null}
            </p>
          </div>
        ) : (
          <div className="grid gap-12 pt-8 min-[900px]:grid-cols-[2fr_1fr] min-[900px]:gap-0">
            <div className="min-[900px]:pr-12">
              <LeadStory post={lead} now={now} />
              {rest.map((p) => (
                <PostRow key={p.id} post={p} now={now} />
              ))}
            </div>
            <aside aria-labelledby="latest" className="rule hidden min-[900px]:block min-[900px]:border-l min-[900px]:pl-12">
              <h2 id="latest" className="label mb-4">
                Latest
              </h2>
              <ul>
                {posts.slice(0, 6).map((p) => (
                  <HeadlineRow key={p.id} post={p} now={now} />
                ))}
              </ul>
            </aside>
          </div>
        )}

        {(page > 1 || hasMore) && (
          <nav aria-label="Pages" className="sans rule mt-8 flex justify-between border-t pt-6 text-sm font-semibold">
            {hasMore ? (
              <Link href={href(category, page + 1)} className="underline underline-offset-4">
                Older posts
              </Link>
            ) : (
              <span />
            )}
            {page > 1 && (
              <Link href={href(category, page - 1)} className="underline underline-offset-4">
                Newer posts
              </Link>
            )}
          </nav>
        )}
      </Paper>
    </SiteShell>
  );
}
