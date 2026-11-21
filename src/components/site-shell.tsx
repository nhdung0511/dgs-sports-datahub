import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { canEdit, getMyTeam } from "@/lib/db/teams";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { Logo, SITE_NAME } from "./logo";
import { NavLinks } from "./nav-links";
import { ThemeToggle } from "./theme-toggle";

/** Header + footer shared by every page except the full-screen scorer. */
export async function SiteShell({
  children,
  wide = false,
  needsDb = true,
  bare = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
  /** false: render children even before Supabase is configured. */
  needsDb?: boolean;
  /** true: children control their own full-width sections (landing page). */
  bare?: boolean;
}) {
  const session = isSupabaseConfigured ? await getSessionUser() : null;
  const user = session?.user ?? null;
  // Team members (any role) get the Analysis tab; only admins/scorekeepers can create games.
  const member = session && user ? await getMyTeam(session.supabase, user.id) : null;
  const content = isSupabaseConfigured || !needsDb ? children : <SetupNotice />;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 bg-brand text-white shadow-md shadow-black/10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-4 py-4 sm:px-8 sm:py-5">
          <Logo />
          {/* On phones the links drop to their own row under the logo + buttons. */}
          <div className="order-3 w-full lg:order-none lg:w-auto">
            <NavLinks showAnalysis={Boolean(member)} />
          </div>
          <div className="ml-auto flex items-center gap-3">
            {user && (
              <form action="/auth/signout" method="post">
                <button
                  className="text-sm font-bold uppercase tracking-wide text-white decoration-2 underline-offset-[6px] transition-colors hover:text-lime-strong hover:underline"
                  title={user.email ?? undefined}
                >
                  Sign out
                </button>
              </form>
            )}
            {/* Signed out → Sign in; admins/scorekeepers → New game; players and others → nothing. */}
            {isSupabaseConfigured && (!user || canEdit(member?.role)) && (
              <Link
                href={user ? "/games/new" : "/login"}
                className="inline-flex items-center gap-1.5 rounded-md bg-lime-strong px-4 py-2 text-sm font-black uppercase tracking-wide text-black transition hover:brightness-95"
              >
                {user ? "New game" : "Sign in"} <span aria-hidden>→</span>
              </Link>
            )}
            <ThemeToggle onBrand />
          </div>
        </div>
      </header>

      <div className="flex-1">
        {bare ? (
          content
        ) : (
          <main className={`mx-auto px-4 py-8 sm:px-8 ${wide ? "max-w-6xl" : "max-w-4xl"}`}>{content}</main>
        )}
      </div>

      <footer className="border-t border-line bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted sm:px-8">
          <span>
            © {new Date().getFullYear()} {SITE_NAME} · DGS Sports Data Analytics Club
          </span>
          <span className="flex gap-5">
            <Link href="/#about" className="hover:text-fg hover:underline">
              About us
            </Link>
            <Link href="/#contact" className="hover:text-fg hover:underline">
              Contact us
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}

export function SetupNotice() {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-warn/50 bg-warn-soft p-6">
      <h1 className="text-xl font-black">Connect the database first</h1>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm">
        <li>Create a free project at supabase.com.</li>
        <li>
          In its SQL Editor, run the files in <code className="font-bold">supabase/migrations</code>{" "}
          in order.
        </li>
        <li>
          Copy <code className="font-bold">.env.example</code> to{" "}
          <code className="font-bold">.env.local</code> and fill in the URL and key.
        </li>
        <li>Restart the dev server.</li>
      </ol>
    </div>
  );
}

export function PageTitle({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-black uppercase tracking-tight sm:text-4xl">{title}</h1>
        {sub && <p className="mt-1 text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Notice({ msg, tone = "info" }: { msg?: string; tone?: "info" | "error" }) {
  if (!msg) return null;
  return (
    <p
      className={`mb-6 rounded-xl px-4 py-3 text-sm font-medium ${
        tone === "error" ? "bg-opp-soft text-fg ring-1 ring-opp/40" : "bg-lime-soft text-fg ring-1 ring-lime/50"
      }`}
    >
      {msg}
    </p>
  );
}