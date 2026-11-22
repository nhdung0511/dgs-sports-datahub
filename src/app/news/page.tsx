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
  // Front-page split: lead in the centre, a text column either side, the overflow in a grid below.
  const [lead, ...rest] = posts;
  const leftCol = rest.slice(0, 3);
  const rightCol = rest.slice(3, 8);
  const more = rest.slice(8);
  const dateline = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <SiteShell bare>
      <Paper>
        <header className="masthead">
          <div className="sans muted flex flex-wrap items-center justify-between gap-x-6 text-[13px]">
            <time dateTime={now.toISOString()} suppressHydrationWarning>
              {dateline}
            </time>
            {member ? <NewsToolbar isAdmin={member.role === "admin"} queued={queued} /> : <span>DGS Sports Data Analytics Club</span>}
          </div>
          <h1 className="wordmark">
            <Link href="/news">The DGS Sports News</Link>
          </h1>
          <p className="sans muted text-center text-[13px] italic">Recaps, analysis and news from the DGS Sports Data Analytics Club.</p>
        </header>

        <nav aria-label="Categories" className="section-nav">
          <div className="tabs justify-center">
            {[{ value: undefined, label: "All" }, ...CATEGORIES].map((c) => (
              <Link key={c.label} href={href(c.value)} className="tab" aria-current={c.value === category ? "page" : undefined}>
                {c.label}
              </Link>
            ))}
          </div>
        </nav>

        {!isSupabaseConfigured || !lead ? (
          <div className="py-12 text-center">
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
          <>
            <div className="front">
              <section aria-label="Top story" className="front-lead">
                <LeadStory post={lead} now={now} />
              </section>
              {leftCol.length > 0 && (
                <section aria-label="More stories" className="front-left">
                  {leftCol.map((p, i) => (
                    <PostRow key={p.id} post={p} now={now} first={i === 0} />
                  ))}
                </section>
              )}
              {rightCol.length > 0 && (
                <aside aria-labelledby="latest" className="front-right">
                  <h2 id="latest" className="section-head">
                    Latest
                  </h2>
                  <ul>
                    {rightCol.map((p) => (
                      <HeadlineRow key={p.id} post={p} now={now} />
                    ))}
                  </ul>
                </aside>
              )}
            </div>

            {more.length > 0 && (
              <section aria-labelledby="more" className="more">
                <h2 id="more" className="section-head">
                  More news
                </h2>
                <div className="more-grid">
                  {more.map((p) => (
                    <PostRow key={p.id} post={p} now={now} first />
                  ))}
                </div>
              </section>
            )}
          </>
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
