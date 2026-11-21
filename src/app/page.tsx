import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/env";

const sections = [
  { href: "/games/new", title: "New game", body: "Set opponent, format and starting lineup." },
  { href: "/team", title: "Team & roster", body: "Your club team and saved players." },
  { href: "/season", title: "Season stats", body: "Per-player totals and averages." },
  { href: "/dashboard", title: "Dashboard", body: "Trends and charts across the season." },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl p-6 sm:p-10">
      <h1 className="text-3xl font-semibold">Courtside Tracker</h1>
      <p className="mt-2 text-neutral-500">Live basketball scorekeeping and stats.</p>

      {!isSupabaseConfigured && (
        <p className="mt-6 rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
          Supabase isn&apos;t configured yet. Copy <code>.env.example</code> to{" "}
          <code>.env.local</code> and add your project URL and key.
        </p>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {sections.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-lg border border-neutral-200 p-4 hover:border-neutral-400 dark:border-neutral-800"
          >
            <h2 className="font-medium">{s.title}</h2>
            <p className="mt-1 text-sm text-neutral-500">{s.body}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
