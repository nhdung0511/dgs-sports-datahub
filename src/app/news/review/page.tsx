import Link from "next/link";
import { SiteShell } from "@/components/site-shell";
import { Flash } from "@/components/news/flash";
import { Paper } from "@/components/news/paper";
import { StatusRow } from "@/components/news/status-row";
import { requireUser } from "@/lib/auth";
import { listReviewQueue } from "@/lib/db/news";
import { getMyTeam } from "@/lib/db/teams";

type Search = Promise<{ error?: string; moved?: string; deleted?: string }>;

export default async function Review({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser("/news/review");
  const member = await getMyTeam(supabase, user.id);
  // Cosmetic: RLS is what stops non-admins from publishing.
  const isAdmin = member?.role === "admin";
  const queue = isAdmin && member ? await listReviewQueue(supabase, member.id) : [];
  const now = new Date();

  return (
    <SiteShell bare>
      <Paper narrow>
        <h1 className="h-page">Review</h1>
        <p className="sans muted mb-6 mt-3 text-[15px]">Posts waiting for an admin, oldest first.</p>
        <Flash sp={sp} />
        {!isAdmin ? (
          <p className="text-xl">Only team admins can review posts.</p>
        ) : queue.length === 0 ? (
          <div>
            <p className="text-xl">Nothing to review.</p>
            <p className="sans mt-3 text-[15px]">
              <Link href="/news" className="underline underline-offset-4">
                Back to news
              </Link>
            </p>
          </div>
        ) : (
          <ul>
            {queue.map((p) => (
              <StatusRow
                key={p.id}
                post={p}
                back="/news/review"
                now={now}
                actions={[
                  { label: "Publish", to: "published", primary: true },
                  { label: "Send back", to: "draft" },
                ]}
              />
            ))}
          </ul>
        )}
      </Paper>
    </SiteShell>
  );
}
