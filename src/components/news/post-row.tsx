import Link from "next/link";
import { categoryLabel, formatNewsDate, keepScores } from "@/lib/news";
import type { PostListItem } from "@/lib/db/news";

export function PostMeta({ post, now }: { post: PostListItem; now: Date }) {
  return (
    <p className="sans tnum muted mt-2 text-[13px]">
      By {post.authorName} · <time dateTime={post.publishedAt ?? post.createdAt}>{formatNewsDate(post.publishedAt ?? post.createdAt, now, true)}</time>
    </p>
  );
}

export function LeadStory({ post, now }: { post: PostListItem; now: Date }) {
  return (
    <article className="pb-6">
      <p className="label">{categoryLabel(post.category)}</p>
      <h2 className="h-lead hl mt-4">
        <Link href={`/news/${post.slug}`}>{keepScores(post.title)}</Link>
      </h2>
      {post.excerpt && <p className="dek mt-3">{post.excerpt}</p>}
      <PostMeta post={post} now={now} />
    </article>
  );
}

export function PostRow({ post, now }: { post: PostListItem; now: Date }) {
  return (
    <article className="rule border-t py-5">
      <p className="label">{categoryLabel(post.category)}</p>
      <h3 className="h-row hl mt-3">
        <Link href={`/news/${post.slug}`}>{keepScores(post.title)}</Link>
      </h3>
      {post.excerpt && <p className="clamp-2 muted mt-2 text-[17px] leading-[1.45]">{post.excerpt}</p>}
      <PostMeta post={post} now={now} />
    </article>
  );
}

/** Headline + date only, for the "Latest" column and "Read next". */
export function HeadlineRow({ post, now }: { post: PostListItem; now: Date }) {
  return (
    <li className="rule border-t py-4 first:border-t-0 first:pt-0">
      <p className="hl text-[18px] font-bold leading-[1.25]">
        <Link href={`/news/${post.slug}`}>{keepScores(post.title)}</Link>
      </p>
      <p className="sans tnum muted mt-1 text-[13px]">{formatNewsDate(post.publishedAt ?? post.createdAt, now)}</p>
    </li>
  );
}
