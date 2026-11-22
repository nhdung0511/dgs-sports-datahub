import Link from "next/link";
import { SiteShell } from "@/components/site-shell";
import { Paper } from "@/components/news/paper";

export default function NotFound() {
  return (
    <SiteShell bare>
      <Paper narrow>
        <h1 className="h-article">That post isn’t here</h1>
        <p className="mt-4 text-xl">It may have been removed, or it isn’t published yet.</p>
        <p className="sans mt-6 text-[15px]">
          <Link href="/news" className="underline underline-offset-4">
            Back to all news
          </Link>
        </p>
      </Paper>
    </SiteShell>
  );
}
