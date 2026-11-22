import { SiteShell } from "@/components/site-shell";
import { Paper } from "@/components/news/paper";
import { PostForm } from "@/components/news/post-form";
import { requireUser } from "@/lib/auth";
import { getMyTeam } from "@/lib/db/teams";
import Link from "next/link";

export default async function NewPost() {
  const { supabase, user } = await requireUser("/news/new");
  const member = await getMyTeam(supabase, user.id);
  return (
    <SiteShell bare>
      <Paper>
        <h1 className="h-page mb-8">Write a post</h1>
        {member ? (
          <PostForm
            isAdmin={member.role === "admin"}
            initial={{ title: "", summary: "", body: "", category: "news", authorName: "", status: "draft" }}
          />
        ) : (
          <p className="text-xl">
            Only team members can write posts.{" "}
            <Link href="/team" className="underline underline-offset-4">
              Set up your team
            </Link>
          </p>
        )}
      </Paper>
    </SiteShell>
  );
}
