# Courtside Tracker

Live basketball scorekeeping and stats for the Sports Data Analytics Club.
Next.js (App Router) + Supabase (Postgres, Auth, Realtime), deployed on Vercel.

## Setup

1. Create a project at [supabase.com](https://supabase.com).
2. In the Supabase SQL Editor, run `supabase/migrations/0001_init.sql`.
3. Copy `.env.example` to `.env.local` and fill in the project URL and anon/publishable key
   (Project Settings → API).
4. Install and run:

   ```bash
   npm install
   npm run dev
   ```

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
| `/`                 | Home                               |
| `/login`            | Scorekeeper sign-in                |
| `/team`             | Club team and roster               |
| `/games/new`        | Create a game (format, opponent)   |
| `/games/[id]/score` | Courtside scoring screen           |
| `/g/[id]`           | Public live game page              |
| `/season`           | Season stats                       |
| `/dashboard`        | Charts and trends                  |
