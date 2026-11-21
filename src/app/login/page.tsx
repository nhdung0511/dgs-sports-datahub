import { redirect } from "next/navigation";
import { SiteShell } from "@/components/site-shell";
import { getSessionUser, safeNext } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const target = safeNext(next);
  if (isSupabaseConfigured) {
    const { user } = await getSessionUser();
    if (user) redirect(target);
  }

  return (
    <SiteShell>
      <div className="mx-auto max-w-md pt-6">
        <h1 className="text-center text-3xl font-black">Scorekeeper sign-in</h1>
        <p className="mt-2 text-center text-muted">
          We&apos;ll email you a link. No password needed. Watching a game doesn&apos;t need an account.
        </p>
        {error && (
          <p className="mt-6 rounded-xl bg-opp-soft px-4 py-3 text-sm ring-1 ring-opp/40">
            That sign-in link didn&apos;t work or has expired. Request a new one.
          </p>
        )}
        <LoginForm next={target} />
      </div>
    </SiteShell>
  );
}
