# DGS Sports Datahub

Home of the Sports Data Analytics Club: **live basketball scorekeeping and stats**, plus a
**sports news blog** where club members publish recaps, analysis write-ups and sports news.
Next.js (App Router) + Supabase (Postgres, Auth, Realtime), deployed on Vercel.

See [`PLAN.md`](PLAN.md) for the goal, scope and current status (what's done, what's planned).

## Setup

1. Create a project at [supabase.com](https://supabase.com).
2. In the Supabase SQL Editor, run `supabase/migrations/0001_init.sql`, then
   `0002_team_members.sql`, then `0003_news_contact.sql`, then `0004_grants.sql`, then
   `0005_player_role.sql`, then `0006_benchmarks_archetypes.sql`.
   In Authentication → URL Configuration, set the Site URL (e.g. `http://localhost:3000`)
   and add `http://localhost:3000/auth/callback` to the redirect URLs.
3. Copy `.env.example` to `.env.local` and fill in the project URL and anon/publishable key
   (Project Settings → API).
4. Install and run:

   ```bash
   npm install
   npm run dev
   ```

## Deploy (Vercel)

1. Push this repo to GitHub.
2. On [vercel.com](https://vercel.com): **Add New → Project**, import the repo (Next.js is auto-detected).
3. Add environment variables `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (same values as `.env.local`), then **Deploy**.
4. In Supabase → Authentication → URL Configuration, set the Site URL to the Vercel URL
   (e.g. `https://sports-tracker.vercel.app`) and add `https://<your-domain>/auth/callback`
   to the redirect URLs — otherwise sign-in links point back to localhost.
5. Every push to `main` redeploys automatically. Custom domains: Vercel → Settings → Domains
   (then update the Supabase URLs to match).

## Scripts

| Command         | What it does               |
| --------------- | -------------------------- |
| `npm run dev`   | Dev server on :3000        |
| `npm test`      | Unit tests (vitest)        |
| `npm run lint`  | ESLint                     |
| `npm run build` | Production build           |

## Design

- **Event log is the source of truth.** Every play is a row in `game_events`; box scores,
  plus/minus and minutes are recomputed from it (`src/lib/sports/basketball/stats.ts`).
  Undo and edits soft-delete or update events, so nothing drifts.
- **Offline-first scoring.** Events get a device-generated UUID and go to a local outbox
  (`src/lib/offline/outbox.ts`), then are upserted to Supabase on reconnect.
- **One scorekeeper per game.** RLS only lets `games.scorekeeper_id` write a game's events.
- **Public via link.** Anyone can read games and events; only signed-in team members write.
- **News and data together.** Blog posts (`news_posts`) are public to read; only team admins publish
  today (more authors planned — see `PLAN.md`). Posts will be able to link to a game's box score.
- **Multi-sport ready.** Teams/players/games/events are sport-agnostic; each sport adds its
  event types, payloads and stat rules under `src/lib/sports/<sport>/`.

## Routes

| Route               | Purpose                            |
| ------------------- | ---------------------------------- |
| `/`                 | Home: recent games, quick actions  |
| `/login`            | Scorekeeper sign-in (email link)   |
| `/team`             | Team, roster, scorekeepers         |
| `/games`            | All games                          |
| `/games/new`        | Create a game (format, opponent)   |
| `/games/[id]/score` | Courtside scoring screen           |
| `/g/[id]`           | Public live game page + CSV export |
| `/season`           | Season stats + CSV export          |
| `/dashboard`        | Charts, lineups, game log          |
| `/analysis`         | Team-only advanced stats           |
| `/analysis/settings`| Benchmarks and archetypes (admins) |
| `/news` *(planned)* | Blog: all posts, `/news/[slug]` per post |

Today, news appears as "Latest News" on `/` (admins post from there).

## First run

1. Sign in at `/login` with your email.
2. Go to **Team**, create the team and add at least five players.
3. **New game** → pick the format → you land on the scoring screen.
4. Press **Share live link** to give fans the public page.
5. **Finish game** when it's over; it then counts toward season stats.

Other scorekeepers sign in once, then a team admin adds them by email on the Team page.

## Contributing

Don't push directly to `main`. For each feature:

1. `git switch -c feat/short-name` (use `fix/…` or `docs/…` for other work).
2. Push the branch early and open a **draft pull request** — that tells the team you're working on it.
   Say in the title if you touch a high-conflict file (`games/[id]/score/scorer.tsx`, the Analysis views).
3. Vercel builds a preview URL for the branch; test the feature there.
4. Before marking ready: `npm test`, `npm run lint`, `npm run build`.
5. Get one teammate's review, then squash-merge into `main` and delete the branch.

Database changes: add the next numbered file in `supabase/migrations/` (tell the team which number you
took) and list it in Setup above. Update the status rows in `PLAN.md` in the same PR.
