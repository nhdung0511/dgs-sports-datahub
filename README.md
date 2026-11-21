# DGS Sports Datahub

Live basketball scorekeeping and stats for the Sports Data Analytics Club.
Next.js (App Router) + Supabase (Postgres, Auth, Realtime), deployed on Vercel.

## Setup

1. Create a project at [supabase.com](https://supabase.com).
2. In the Supabase SQL Editor, run `supabase/migrations/0001_init.sql`, then
   `0002_team_members.sql`, then `0003_news_contact.sql`.
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

## First run

1. Sign in at `/login` with your email.
2. Go to **Team**, create the team and add at least five players.
3. **New game** → pick the format → you land on the scoring screen.
4. Press **Share live link** to give fans the public page.
5. **Finish game** when it's over; it then counts toward season stats.

Other scorekeepers sign in once, then a team admin adds them by email on the Team page.
