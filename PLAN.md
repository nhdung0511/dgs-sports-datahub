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

| Who                       | Can do                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------- |
| Anyone (no login)         | Read **published** blog posts, live games, box scores, season stats                 |
| Team **player**           | Above + team-only Analysis (view only) + write blog drafts and submit them          |
| Team **scorekeeper**      | Above + score games                                                                 |
| Team **admin**            | Above + manage roster/members/settings, review queue, **publish/unpublish/edit/delete any post** |

Blog authorship: any team member can write. Only an admin publishes. See "Blog decisions" below.

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
Full handoff (design spec, file list, acceptance criteria): [`docs/news-blog-handoff.md`](docs/news-blog-handoff.md).

| # | Item                                                                                       | Status  |
| - | ------------------------------------------------------------------------------------------ | ------- |
| 1 | Migration `0007_news_blog.sql`: slug, summary, category, status, byline, published_at, RLS  | Written, **not yet applied/tested** |
| 2 | Data layer `src/lib/db/news.ts`: list/get/create/update/transition; slugify; date format    | Planned |
| 3 | Public pages `/news` (list + category filter) and `/news/[slug]`, Open Graph metadata        | Planned |
| 4 | Nav "News" link; home "Latest news" links to post pages                                      | Planned |
| 5 | Editor `/news/new`, `/news/[slug]/edit` (markdown + live preview, swappable editor component) | Planned |
| 6 | Workflow: `/news/mine`, `/news/review` (admin queue), submit / publish / send back / unpublish | Planned |
| 7 | Tests: slugify, date format, markdown sanitising, RLS assertions (incl. "prove it fails")    | Planned |
| 8 | Later PRs: image uploads (Storage), link a post to a game (box score), RSS, friendlier editor | Backlog |

Until the blog ships, the home page keeps working: admins post from the old form (now inserted as
`published`) and the home list shows published posts only.

### Collaboration / tooling
| Item                                                        | Status  |
| ----------------------------------------------------------- | ------- |
| Feature-branch + PR workflow (see README → Contributing)    | Adopted |
| CI: lint, typecheck, test, build on every PR                | Planned |
| Branch protection on `main`                                 | Planned |
| Split `scorer.tsx` (668 lines) into smaller components      | Planned |
| Drop root `force-dynamic`; let public pages cache/revalidate | Planned |

## Blog decisions (agreed 2026-11-22)
- **Authors:** any team member writes; admins publish. Admins can also publish their own posts directly.
- **Workflow:** `draft -> submitted -> published`. Admin can send a submitted post back to draft, or unpublish.
- **After publish:** non-admin authors cannot edit. Only admins edit published posts.
- **Delete:** author deletes own drafts; admins delete anything.
- **Body:** markdown, sanitised on render (no raw HTML), live preview. The editor is one swappable component
  (`{ value, onChange }`) so a friendlier editor for non-technical writers can replace it later without
  touching storage, pages or RLS.
- **Images:** none in v1 (markdown may reference an external https image). Uploads are a later PR.
- **Byline:** free-text "Written by" per post. No emails or profile table.
- **Categories:** one per post: Game recap, Analysis, News, Opinion. Fixed list, changed by migration.
- **Scope:** one club blog (`/news`, `/news/[slug]`); `team_id` stays for RLS.
- **v1 line:** share metadata (Open Graph) yes; game links and RSS later.
- **Slugs** are generated once from the title and never change.

Still open: non-team club members as authors (needs a new role); comments/reactions (out of scope).

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
- Non-UUID ids make Postgres throw; `fetchGame` guards for this — do the same for any new `[id]` route.
- Migration `0004` grants all tables to `anon` by default. RLS still protects rows, but revoke anon's writes by name on any new table (see `0007`).
- Postgres has no `unaccent` here; transliterate diacritics (Vietnamese `đ`, `ư`...) in the app before saving a slug.
