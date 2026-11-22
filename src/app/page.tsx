import Link from "next/link";
import { GameCard, formatDate } from "@/components/game-card";
import { HeroPhoto, heroPhotoSrc } from "@/components/hero-photo";
import { SetupNotice, SiteShell } from "@/components/site-shell";
import { card, input, label } from "@/components/ui";
import { getSessionUser } from "@/lib/auth";
import { fetchRoster, listGames, loadGamesWithBox, type GameWithBox } from "@/lib/db/games";
import { listNewsPosts, resultNews, type NewsItem } from "@/lib/db/news";
import { canEdit, getClubTeam, getMyTeam, type Role } from "@/lib/db/teams";
import type { Team } from "@/lib/sports/types";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { sendContactMessage } from "./home-actions";

type Search = Promise<{ contact?: string; contactError?: string }>;

export default async function Home({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  let myTeam: (Team & { role: Role }) | null = null;
  let team: Team | null = null;
  let recent: GameWithBox[] = [];
  let news: NewsItem[] = [];
  let userId: string | undefined;
  let signedIn = false;

  if (isSupabaseConfigured) {
    const { supabase, user } = await getSessionUser();
    signedIn = Boolean(user);
    userId = user?.id;
    myTeam = user ? await getMyTeam(supabase, user.id) : null;
    team = myTeam ?? (await getClubTeam(supabase));
    if (team) {
      const [games, posts, roster] = await Promise.all([
        listGames(supabase, team.id, { limit: 6 }),
        listNewsPosts(supabase, team.id),
        fetchRoster(supabase, team.id, { includeInactive: true }),
      ]);
      recent = await loadGamesWithBox(supabase, games);
      const nameOf = (id: string) => roster.find((p) => p.id === id)?.name ?? "A teammate";
      news = [...posts, ...resultNews(recent, nameOf, team.name)]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 6);
    }
  }

  const liveGame = recent.find((g) => g.game.status === "live");
  const isEditor = canEdit(myTeam?.role);
  const photo = heroPhotoSrc();

  return (
    <SiteShell needsDb={false} bare>
      {/* HERO — always dark, like a stadium at night */}
      <section className="relative overflow-hidden bg-[#04100d] text-white">
        {/* Centered until a hero photo is added; then text left, photo right. */}
        <div
          className={`relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-8 lg:py-24 ${
            photo ? "lg:grid-cols-[1.05fr_1fr]" : ""
          }`}
        >
          <div className={photo ? "" : "flex flex-col items-center text-center"}>
            <h1 className="text-5xl font-black uppercase leading-[0.95] tracking-tight text-lime-strong sm:text-6xl lg:text-7xl">
              DGS
              <br />
              Athletics&apos;
              <br />
              Data.
            </h1>
            <p className="mt-8 max-w-md text-lg text-white/80">
              Live scores, full box scores and season insights for every <b className="text-white">DGS</b> game,
              recorded courtside by our club&apos;s scorekeepers.
            </p>
            <div className={`mt-9 flex flex-wrap gap-4 ${photo ? "" : "justify-center"}`}>
              <Link
                href={liveGame ? `/g/${liveGame.game.id}` : "/games"}
                className="inline-flex items-center gap-3 rounded-md bg-cyan-strong px-8 py-4 text-lg font-black uppercase tracking-wide text-black transition hover:brightness-95"
              >
                {liveGame ? "Watch live now" : "See our games"} <span aria-hidden>→</span>
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center rounded-md border-2 border-white/30 px-6 py-4 text-lg font-bold uppercase tracking-wide transition hover:border-lime-strong hover:text-lime-strong"
              >
                Dashboard
              </Link>
            </div>
          </div>
          <HeroPhoto src={photo} />
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-20 px-4 py-16 sm:px-8">
        {!isSupabaseConfigured ? (
          <SetupNotice />
        ) : (
          <>
            {/* GAMES */}
            <section>
              <SectionHead
                title="Recent games"
                action={
                  <Link href="/games" className="text-sm font-bold uppercase tracking-wide text-cyan hover:underline">
                    All games →
                  </Link>
                }
              />
              {recent.length === 0 ? (
                <p className="rounded-2xl border-2 border-dashed border-line p-8 text-center text-muted">
                  No games yet.{" "}
                  {isEditor ? (
                    <Link href="/games/new" className="font-bold text-cyan underline">
                      Start the first one
                    </Link>
                  ) : signedIn && !myTeam ? (
                    <Link href="/team" className="font-bold text-cyan underline">
                      Set up your team
                    </Link>
                  ) : (
                    "Check back on game day."
                  )}
                </p>
              ) : (
                <ul className="grid gap-3 md:grid-cols-2">
                  {recent.map((g) => (
                    <GameCard key={g.game.id} item={g} canScore={Boolean(isEditor && g.game.scorekeeperId === userId)} />
                  ))}
                </ul>
              )}
            </section>

            {/* NEWS */}
            <section id="news" className="scroll-mt-28">
              <SectionHead
                title="Latest news"
                action={
                  <span className="flex gap-6 text-sm font-bold uppercase tracking-wide">
                    {myTeam && (
                      <Link href="/news/new" className="text-cyan hover:underline">
                        Write a post
                      </Link>
                    )}
                    <Link href="/news" className="text-cyan hover:underline">
                      All news →
                    </Link>
                  </span>
                }
              />

              {news.length === 0 ? (
                <p className="rounded-2xl border-2 border-dashed border-line p-8 text-center text-muted">
                  No news yet. Results and club updates will show up here.
                </p>
              ) : (
                <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                  {news.map((n) => (
                    <article
                      key={n.id}
                      className={`${card} flex flex-col overflow-hidden transition hover:border-cyan`}
                    >
                      <div className={`h-1.5 ${n.kind === "result" ? "bg-cyan-strong" : "bg-lime-strong"}`} />
                      <div className="flex flex-1 flex-col p-5">
                        <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-muted">
                          <span className={n.kind === "result" ? "text-cyan" : "text-lime"}>
                            {n.kind === "result" ? "Game result" : "News"}
                          </span>
                          <span>{formatDate(n.date)}</span>
                        </div>
                        <h3 className="mt-2 text-lg font-black leading-snug">
                          {n.href ? (
                            <Link href={n.href} className="hover:underline">
                              {n.title}
                            </Link>
                          ) : (
                            n.title
                          )}
                        </h3>
                        <p className="mt-2 line-clamp-4 whitespace-pre-line text-sm text-muted">{n.body}</p>
                        <div className="mt-auto pt-4">
                          {n.href && (
                            <Link href={n.href} className="text-sm font-bold uppercase tracking-wide text-cyan hover:underline">
                              {n.kind === "result" ? "Box score →" : "Read post →"}
                            </Link>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {/* ABOUT */}
        <section id="about" className="scroll-mt-28">
          <SectionHead title="About us" />
          <div className="max-w-3xl">
            <div className="space-y-4 text-lg text-muted">
              <p>
                Hi! We are Huy Dung and Viet Lam, two high
                school students who are passionate about the statistical side of sports. We created this project in
                order to make sports data more available for our school&apos;s sports team, the DGS Otters.
              </p>
              <p>We&apos;re starting with basketball and adding more sports next.</p>
              <p className="font-bold text-fg">Go Otters!</p>
            </div>
          </div>
        </section>

        {/* CONTACT */}
        <section id="contact" className="scroll-mt-28">
          <SectionHead title="Contact us" />
          <div className="max-w-3xl">
            {sp.contact === "sent" ? (
              <div className={`${card} p-8 text-center`}>
                <p className="text-4xl text-lime">✓</p>
                <h3 className="mt-2 text-xl font-black">Message sent</h3>
                <p className="mt-1 text-muted">Thanks! We&apos;ll reply to the email you gave us.</p>
              </div>
            ) : (
              <form action={sendContactMessage} className={`${card} space-y-4 p-6`}>
                {sp.contactError && (
                  <p className="rounded-xl bg-opp-soft px-4 py-3 text-sm font-medium ring-1 ring-opp/40">{sp.contactError}</p>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="c-name" className={label}>
                      Name
                    </label>
                    <input id="c-name" name="name" required maxLength={120} autoComplete="name" className={input} />
                  </div>
                  <div>
                    <label htmlFor="c-email" className={label}>
                      Email
                    </label>
                    <input id="c-email" name="email" type="email" required autoComplete="email" className={input} />
                  </div>
                </div>
                <div>
                  <label htmlFor="c-message" className={label}>
                    Message
                  </label>
                  <textarea id="c-message" name="message" required rows={5} maxLength={4000} className={input} />
                </div>
                {/* Spam trap, hidden from people. */}
                <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
                <button
                  disabled={!isSupabaseConfigured}
                  className="inline-flex items-center gap-2 rounded-md bg-lime-strong px-6 py-3 font-black uppercase tracking-wide text-black transition hover:brightness-95 disabled:opacity-50"
                >
                  Send message <span aria-hidden>→</span>
                </button>
              </form>
            )}
          </div>
        </section>
      </div>
    </SiteShell>
  );
}

function SectionHead({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <h2 className="text-4xl font-black uppercase tracking-tight sm:text-5xl">{title}</h2>
      {action}
    </div>
  );
}
