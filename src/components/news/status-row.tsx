import Link from "next/link";
import { moveToStatus, removePost } from "@/app/news/actions";
import type { PostListItem } from "@/lib/db/news";
import { STATUS_LABEL, categoryLabel, formatNewsDate } from "@/lib/news";

type Act = { label: string; to?: "draft" | "submitted" | "published"; primary?: boolean; remove?: boolean };

/** Row for My posts and the review queue: same shape as the public list, plus text buttons. */
export function StatusRow({ post, actions, back, now }: { post: PostListItem; actions: Act[]; back: string; now: Date }) {
  return (
    <li className="rule border-t py-5">
      <p className="sans flex items-center gap-2 text-[13px]">
        <span className={`dot dot-${post.status}`} aria-hidden />
        {STATUS_LABEL[post.status]}
        <span className="muted">· {categoryLabel(post.category)}</span>
      </p>
      <h3 className="h-row hl mt-3">
        <Link href={post.status === "published" ? `/news/${post.slug}` : `/news/${post.slug}/edit`}>{post.title}</Link>
      </h3>
      <p className="sans tnum muted mt-2 text-[13px]">
        By {post.authorName} · Updated {formatNewsDate(post.updatedAt, now, true)}
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        {post.status !== "published" && (
          <Link href={`/news/${post.slug}/edit`} className="btn">
            Edit
          </Link>
        )}
        {actions.map((a) => (
          <form key={a.label} action={a.remove ? removePost : moveToStatus}>
            <input type="hidden" name="id" value={post.id} />
            <input type="hidden" name="back" value={back} />
            {a.to && <input type="hidden" name="to" value={a.to} />}
            <button className={a.primary ? "btn btn-primary" : a.remove ? "btn btn-quiet" : "btn"}>{a.label}</button>
          </form>
        ))}
      </div>
    </li>
  );
}
