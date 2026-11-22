# PLAN — DGS Sports Datahub

Source of truth for goal, scope, architecture and status. Update the status rows in the same PR that
changes them. Detailed spec for the analysis work lives in [`docs/analysis-plan.md`](docs/analysis-plan.md).

## Goal

A home for the Sports Data Analytics Club with two equal pillars:

1. **Data** — live basketball scorekeeping, box scores, season stats and team-only advanced analysis.
2. **News** — a sports blog: club members write and publish articles (game recaps, analysis write-ups,
   general sports news) that anyone can read.

The two feed each other: a recap post can embed or link a game's box score, and an analysis chart can be
cited from a post.

## Audience and visibility

| Who                         | Can do                                                                   |
| --------------------------- | ------------------------------------------------------------------------ |
| Anyone (no login)           | Read blog posts, live games, box scores, season stats                    |
| Signed-in team **player**   | Everything above + team-only Analysis tab (view only)                    |
| Team **scorekeeper**        | Above + score games                                                      |
| Team **admin**              | Above + manage roster/members, settings, **publish and edit all posts**  |
| Post **author** (see below) | Write and edit their own posts; published ones are public                |

Who may author is an open question — see "Decisions to make".

## Architecture

- Next.js (App Router) + React 19 + Tailwind 4, deployed on Vercel.
- Supabase: Postgres, Auth (email magic link), Realtime. **RLS is the only security boundary** — UI checks
  are cosmetic.
- Sport logic is pure and tested: `src/lib/sports/<sport>/`. DB access: `src/lib/db/`. Routes: `src/app/`.
- Event log (`game_events`) is the source of truth for all game stats.
- Charts are hand-drawn SVG, no chart library.
- Migrations are numbered SQL files in `supabase/migrations/`, applied in order.

## Status

### Data pillar
| Item                                                         | Status |
| ------------------------------------------------------------ | ------ |
| Live scorekeeping, offline outbox, public live page          | Done   |
| Season stats, dashboard, CSV export                          | Done   |
| Analysis stage 1 — opponent team recording + Player role     | Done   |
| Analysis stage 2 — advanced stat calculations (tested)       | Done   |
| Analysis stage 3 — team-only Analysis tab                    | Done   |
| Analysis stage 4 — benchmarks, archetypes, rating            | Done   |
| Analysis extras — PNG export, date/opponent filters          | Check against `docs/analysis-plan.md` |

### News / blog pillar
Today: admins can post a short plain-text item (title ≤ 140 chars, body ≤ 4000) shown as "Latest News" on
the home page (`news_posts`, migration `0003`). There is no post page, no rich formatting, no images.

| # | Item                                                                                   | Status  |
| - | -------------------------------------------------------------------------------------- | ------- |
| 1 | Post pages: `/news` (list) and `/news/[slug]` (public, readable by link, shareable)     | Planned |
| 2 | Migration: slug, summary, cover image, `status` (draft/published), `published_at`, `updated_at`, category/tags; keep RLS (public read of published only; drafts visible to author/admins) | Planned |
| 3 | Editor: `/news/new` and `/news/[slug]/edit` — markdown body with preview, draft/publish | Planned |
| 4 | Images: cover + inline via Supabase Storage (size/type limits, RLS on bucket)           | Planned |
| 5 | Link posts to a game (recap shows box score) and to players                             | Planned |
| 6 | Nav: add "News" to main nav; home shows latest 3 posts linking to full pages            | Planned |
| 7 | Metadata: per-post title/description/Open Graph for link sharing; RSS feed              | Planned |
| 8 | Tests: slug generation, markdown sanitising, RLS assertions (anon sees drafts = zero)   | Planned |

Suggested order: 2 → 1 → 6 → 3 → 8 → 4 → 5 → 7. Each is its own PR.

### Collaboration / tooling
| Item                                                        | Status  |
| ----------------------------------------------------------- | ------- |
| Feature-branch + PR workflow (see README → Contributing)    | Adopted |
| CI: lint, typecheck, test, build on every PR                | Planned |
| Branch protection on `main`                                 | Planned |
| Split `scorer.tsx` (668 lines) into smaller components      | Planned |
| Drop root `force-dynamic`; let public pages cache/revalidate | Planned |

## Decisions to make
- **Who can author posts?** Admins only (current), or any signed-in team member (scorekeeper/player) with
  admin approval before publish? Affects the RLS policy in item 2.
- **Body format:** markdown (recommended — simple, safe when sanitised, easy to diff) vs. a rich-text editor.
- **Non-team writers:** should club members without a team role be able to post? Would need a separate
  author role.
- **Comments / reactions:** out of scope for now.

## Rules for any new work
- A migration that adds a table must enable RLS, grant to `authenticated`, revoke from `anon` by name where
  anon shouldn't have access, and be tested.
- New pure logic gets a test (happy path + edge case).
- Every async view handles loading, error and empty states.
- Property values key by stable id, never by name.

## Gotchas already hit
- Public pages are readable by anyone with the link; never put team-only data (analysis, contact messages)
  behind a client-side check alone.
- Supabase magic-link redirects point at localhost unless the Site URL and redirect URLs are updated for the
  deployed domain.
- Non-UUID ids make Postgres throw; `fetchGame` guards for this — do the same for any new `[id]`/`[slug]` route.
