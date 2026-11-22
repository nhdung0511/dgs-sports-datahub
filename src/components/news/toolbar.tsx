import Link from "next/link";

/** Text links for team members, quiet on purpose. Admins also see the review queue and its count. */
export function NewsToolbar({ isAdmin, queued }: { isAdmin: boolean; queued: number }) {
  return (
    <nav aria-label="Your posts" className="sans flex flex-wrap gap-x-6 text-sm font-semibold">
      <Link href="/news/new" className="inline-flex min-h-11 items-center underline underline-offset-4">
        Write a post
      </Link>
      <Link href="/news/mine" className="inline-flex min-h-11 items-center hover:underline underline-offset-4">
        My posts
      </Link>
      {isAdmin && (
        <Link href="/news/review" className="inline-flex min-h-11 items-center hover:underline underline-offset-4">
          Review{queued > 0 ? ` (${queued})` : ""}
        </Link>
      )}
    </nav>
  );
}
