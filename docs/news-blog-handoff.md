# News blog — handoff

For the session that builds the blog. Read `PLAN.md` first (goal, roles, decisions, gotchas), then this.
Decisions below were settled with the project owner on 2026-11-22; do not reopen them without asking.

## State at handoff

- `supabase/migrations/0007_news_blog.sql` is **written but never run**. No local Postgres was available, so
  neither the SQL syntax nor the policies have been tested. First job: apply it (Supabase SQL Editor, after
  `0001`–`0006`) and write the RLS tests in section 7.
- Two small compatibility edits already made so the current home page survives the migration:
  `src/lib/db/news.ts` (`listNewsPosts` filters `status = 'published'`, orders by `published_at`) and
  `src/app/home-actions.ts` (`createNewsPost` inserts `status: "published"`). The new default status is
  `draft`, so any other insert path must set status explicitly.
- Nothing else in `src/` is blog-aware yet. `node_modules` was not installed when this was written:
  run `npm install` first. Stack is Next 15.5 (`middleware.ts`, `params` is a Promise), React 19, Tailwind 4.

## What already exists (do not rebuild)

- `news_posts` table, `getMyTeam`, `getClubTeam` (the single club team), `requireUser`, `canEdit`,
  `is_team_member` / `is_team_admin` / `is_team_editor` SQL helpers, `SiteShell` / `PageTitle`,
  theme tokens in `src/app/globals.css` (light + `.dark`), `ThemeToggle`.
- The home page "Latest news" section mixes admin posts with auto-generated game results
  (`resultNews`). Keep the results; only the post items start linking to `/news/[slug]`.

## 1. Data model (migration 0007, as written)

| Column         | Notes                                                                                   |
| -------------- | --------------------------------------------------------------------------------------- |
| `slug`         | unique, immutable (trigger), generated once from the title                              |
| `title`        | existing, 1–140 chars                                                                   |
| `summary`      | optional, ≤ 300 chars. The "dek" under the headline and the Open Graph description     |
| `body`         | markdown, 1–50 000 chars                                                                |
| `category`     | `recap` \| `analysis` \| `news` \| `opinion` (labels: Game recap, Analysis, News, Opinion) |
| `status`       | `draft` \| `submitted` \| `published`                                                   |
| `author_name`  | free-text byline, 1–80 chars. Never derive it from email                                |
| `published_at` | set by trigger the first time status becomes `published`; kept across unpublish/republish |
| `updated_at`   | set by trigger on every write                                                           |
| `created_by`, `team_id`, `created_at` | existing; trigger forbids changing `created_by`/`team_id`/`slug`      |

Policies (one line each, they are the security boundary):
- **read:** published, or you are the author, or you are admin of the team. Anon therefore sees published only.
- **insert:** authenticated team member, `created_by = auth.uid()`, status `draft`/`submitted` (admin may use `published`).
- **update:** admin; or the author while status is `draft`/`submitted`. WITH CHECK is the same, so an author
  cannot move a post to `published` and cannot touch it once published.
- **delete:** admin; or the author while `draft`.
- anon has `select` only (insert/update/delete revoked by name).

Accepted consequences, say so in the PR rather than "fixing" silently:
- An author can still edit a post while it is `submitted` (admin may be mid-review). Acceptable for v1.
- Because RLS can't express column-level transitions, "admin sends back to draft" and "unpublish" work only
  because admin passes the policy. Authors can move `draft -> submitted` and back to `draft` themselves.
- Slug uniqueness: the app generates `slugify(title)`; on a unique violation (`23505`) retry with `-2`, `-3`
  (or a 4-char random suffix). The DB trigger fallback uses an id suffix.

## 2. Data layer (`src/lib/db/news.ts`, plus pure helpers under `src/lib/news/`)

Pure, tested helpers (`src/lib/news/`):
- `slugify(title)`: NFD-normalise and strip combining marks, map `đ/Đ -> d`, lowercase, non-alphanumerics to `-`,
  trim dashes, cap at 60, empty -> `post`. Vietnamese titles are plausible; the SQL `slugify` is ASCII-only
  and would otherwise throw their letters away.
- `formatNewsDate(iso, now)`: AP-style month ("Jan.", "Feb.", "March", "April", "May", "June", "July",
  "Aug.", "Sept.", "Oct.", "Nov.", "Dec.") -> `Nov. 21, 2026`. Relative form only inside the last 24 h on the
  list page ("3h ago", "42m ago"). `Intl` gives "Nov 21" with no period, so do not use it for the month.
- `wasEdited(publishedAt, updatedAt)`: true when `updated_at` is more than 60 minutes after `published_at`;
  drives the "Updated 8:48 pm" suffix. Local time of the viewer is fine; no time-zone label in v1.
- `categoryLabel`, `CATEGORIES` constant (single source for form, filter, label).
- `plainSummary(post)`: `summary` or the first ~160 characters of the body with markdown stripped.

DB functions: `listPublishedPosts({category, limit, offset})`, `getPostBySlug(slug)`,
`listMyPosts(userId)`, `listReviewQueue(teamId)` (status `submitted`, oldest first), `createPost`,
`updatePost`, `setPostStatus`, `deletePost`. Select only the columns each view needs (the list never loads
`body`). No per-row queries.

## 3. Routes

| Route                 | Who          | Notes                                                                            |
| --------------------- | ------------ | -------------------------------------------------------------------------------- |
| `/news`               | public       | list, `?category=` filter, paginated (20/page, "Older" link, not infinite scroll) |
| `/news/[slug]`        | public       | published only. Author/admin viewing a draft sees a "Draft" strip above the headline |
| `/news/new`           | team member  | editor                                                                           |
| `/news/[slug]/edit`   | author/admin | author only while draft/submitted; admin always                                  |
| `/news/mine`          | team member  | own posts grouped by status                                                      |
| `/news/review`        | admin        | submitted queue; Publish / Send back                                             |

Server actions (`src/app/news/actions.ts`): save draft, submit, publish (admin), send back (admin),
unpublish (admin), delete. Actions don't duplicate permission checks beyond choosing the right UI; RLS is the boundary. Show the Postgres
error as a plain sentence, not a stack. `revalidatePath("/news")`, `/news/[slug]`, `/` on publish/unpublish.
Non-existent or not-visible slug -> `notFound()`. Every async view needs loading, error and empty states
(`loading.tsx`, `error.tsx`, and a real empty state, three different render paths).
Add "News" to `src/components/nav-links.tsx`; add "Write a post" for members.

Metadata (`generateMetadata` on `/news/[slug]`): `title: "<headline> · DGS Sports Datahub"`,
`description: plainSummary`, `openGraph: { type: "article", publishedTime, authors: [author_name], siteName }`,
Twitter `summary_card`. No images in v1, so add one static default OG image (1200x630, flat brand green
`#1a775f`, wordmark in the serif, no gradient) under `public/`.

## 4. Markdown rendering and the editor

- Render with `react-markdown` (+ `remark-gfm` for lists/links/tables). It outputs React elements, so no
  `dangerouslySetInnerHTML`. **Do not add `rehype-raw`**: raw HTML in posts must stay inert text. New
  dependencies to name in the PR: `react-markdown`, `remark-gfm`. Check `package.json` first, neither is there.
- Link policy: external links get `target="_blank" rel="noopener noreferrer nofollow"`; reject any
  `javascript:`/`data:` href (react-markdown's default `urlTransform` already does; add a test).
- Images: only `https:` URLs, `loading="lazy"`, `max-width: 100%`, rendered inside a `<figure>`; the markdown
  alt text becomes the caption (`<figcaption>`). Accepted risk: external images can track readers.
- Editor lives behind one component: `src/components/news/body-editor.tsx` exporting
  `BodyEditor({ value, onChange, disabled })`. v1 is a `<textarea>` with a small toolbar (bold, italic,
  heading, link, quote, bullet list) that inserts markdown syntax around the selection, plus a preview pane.
  Nothing outside this file may know the editor is markdown-based; pages store/receive a markdown string.
  That is the seam for a friendlier editor later.
- Layout: desktop = write | preview side by side; phone = "Write" / "Preview" tabs (real `<button role="tab">`).
- Fields: headline, summary (counter at 300), category select, "Written by" (prefilled with the author's
  last-used name from `localStorage`, wrapped in try/catch), body.
- Buttons by state: draft -> **Save draft**, **Submit for review**; admin also **Publish**. Submitted ->
  **Save**, **Back to draft**; admin also **Publish**, **Send back**. Published -> admin only: **Save changes**,
  **Unpublish**.
- Unsent-draft safety: mirror title/body into `localStorage` every few seconds; on load, offer "Restore
  unsaved text from 2 min ago?". Warn on navigating away with unsaved changes (`beforeunload`).

## 5. Design spec

**Reference:** a saved article page from The Athletic (NYT). What was actually observable in that file: the
order of elements (headline -> full-width photo -> caption with the photographer credit on the same line ->
byline row with a 40px author avatar, "By Name" and a timestamp line "Nov. 21, 2026 | Updated 8:48 pm EST" ->
"Share article" pill + comment-count pill -> narrow body column), the font roles (`nyt-cheltenham`
headlines, `nyt-imperial` body, `nyt-franklin` for every bit of metadata) and the greys (`#121212` ink,
`#969693` secondary, `#f2f2f2` fills). The stylesheet itself was external and not in the file, so the numbers
below are **our proposed values**, not measurements. We copy the layout and typographic roles, not the
colours, not the fonts (those are proprietary) and not the ad/paywall furniture.

**Goal:** it should read like a small newspaper's sports desk, made by people. Plenty of white space, a serif
that has opinions, thin rules instead of boxes, small caps-style labels. It should not look like a SaaS
template.

### Type
Two families only, both free and both with Vietnamese glyph coverage, loaded with `next/font/google`
(self-hosted at build, `display: swap`, subsets `latin`, `latin-ext`, `vietnamese`), scoped to the `/news`
layout through CSS variables. Do not touch the app-wide Satoshi.

- **Newsreader** (Production Type; has an optical-size axis): headlines, dek, body, pull-quotes.
- **Libre Franklin** (a Franklin Gothic revival, the same genre as `nyt-franklin`): category labels, bylines,
  dates, buttons, filters, captions.

Banned on these pages: Inter, Poppins, Space Grotesk, DM Sans, Geist, system-ui fallbacks as the primary face,
or any display face used as decoration. Fallback stacks: `Georgia, "Times New Roman", serif` and
`"Helvetica Neue", Arial, sans-serif`.

| Role                   | Face / weight                 | Desktop           | Phone (< 640px)   | Other                                     |
| ---------------------- | ----------------------------- | ----------------- | ----------------- | ----------------------------------------- |
| Article headline       | Newsreader 700, opsz 72       | 44 / 1.08         | 32 / 1.12         | `letter-spacing: -0.015em`, `text-wrap: balance` |
| Dek (summary)          | Newsreader 400                | 21 / 1.4          | 19 / 1.4          | `--muted`, max 2 lines visually           |
| Body                   | Newsreader 400, opsz 16       | 19 / 1.65         | 18 / 1.6          | paragraph gap 1.1em, no indent, `hyphens: manual` |
| Body subhead (h2)      | Newsreader 700                | 26 / 1.2          | 23 / 1.2          | margin 2em 0 0.5em                        |
| h3                     | Franklin 700                  | 15 / 1.3          | 15 / 1.3          | uppercase, tracking 0.06em                |
| Category label         | Franklin 700                  | 11 / 1            | 11 / 1            | uppercase, tracking 0.09em, brand colour  |
| Byline name            | Franklin 600                  | 14 / 1.3          | 14 / 1.3          |                                           |
| Date / meta            | Franklin 400, `tnum`          | 13 / 1.3          | 13 / 1.3          | `--muted`                                 |
| Caption / credit       | Franklin 400                  | 13 / 1.45         | 13 / 1.45         | credit in `--muted` at 70% after caption  |
| List-row headline      | Newsreader 700                | 22 / 1.18         | 20 / 1.2          |                                           |
| Lead-story headline    | Newsreader 700                | 36 / 1.1          | 28 / 1.12         |                                           |
| Buttons / filters      | Franklin 600                  | 14                | 14                |                                           |

Use real typographic characters in rendered content: curly quotes and apostrophes, en dash for score ranges
(31–28) and an em dash for datelines. Run body text through a small smart-quote pass only if the author typed
straight quotes (do it at render, never rewrite stored text). Scores and times use tabular figures.

### Colour
Stay inside the existing site palette (green brand `#1a775f`, lime `#b2d762`, aqua `#92dedb`), but make
reading pages calmer than the app: paper background, near-black ink, **one** accent.

| Token            | Light      | Dark       | Use                                                    |
| ---------------- | ---------- | ---------- | ------------------------------------------------------ |
| `--news-paper`   | `#fcfbf8`  | `#0c1512`  | page background for `/news/*` (warm, not pure white)   |
| `--news-ink`     | `#14201c`  | `#e8efec`  | headline and body (reuse `--fg` if contrast is equal)  |
| `--news-muted`   | `#5d6b66`  | `#93a59e`  | dek, dates, captions (>= 4.5:1 on paper, check)        |
| `--news-rule`    | `#d9dfdb`  | `#223630`  | hairlines                                              |
| `--news-accent`  | `#1a775f`  | `#b2d762`  | category labels, link hover, active filter underline   |

No gradients, no shadows, no glass blur, no coloured card backgrounds, no purple. Lime is dark-mode accent only.
Verify contrast of muted-on-paper in both themes; fix the token, not the component.

### Layout and spacing
- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64. Nothing else.
- Page container: max 1120px, side padding 16px (phone) / 32px (desktop).
- **Article:** one column, `max-width: 680px`, centred. Header and body share the same left edge. Reserve a
  "hero" slot above the byline that may break out to 1000px later (images PR); in v1 it is simply absent, with
  no empty box.
- Order: category label -> headline -> dek -> byline row -> share row -> hairline -> body -> end block.
  16px between label and headline, 12px headline to dek, 24px dek to byline, 16px byline to share, 24px share
  to rule, 32px rule to first paragraph.
- **Byline row:** 40px circle with the author's initials (Franklin 600 14px, `--card-2` fill, no border) on
  the left; to its right "By **Name**" (name in 600, not underlined, because there is no author page yet)
  and below it the date line `Nov. 21, 2026` then a 1px x 12px vertical rule with 8px margins, then
  `Updated 8:48 pm` only when `wasEdited`. Use `<time datetime>`.
- **Share row:** one outlined pill (1px `--news-rule`, radius 999px, 32px tall, 14px side padding) labelled "Share article".
  It uses `navigator.share` when available, otherwise copies the link and swaps its own label to "Link copied"
  for 2s (no toast). There is no separate "Copy link" button. Real `<button>`, visible 2px focus
  ring in `--news-accent` with 2px offset.
- **Body:** links underlined 1px, `text-underline-offset: 3px`, ink colour; hover turns accent. Blockquote:
  italic, 2px left rule in `--news-rule`, 20px padding, no quote icon. Lists with real bullets/numbers,
  `padding-left: 1.2em`. `hr` -> centred 48px x 1px rule. Inline images/`figure`: full column width, caption
  in Franklin 13px. Code spans (rare) in a slightly tinted `--card-2`, no scroll box. Do not add a drop cap.
- **End block:** a hairline, then the category as a small outlined pill linking to `/news?category=...`, then
  "Read next": a label (Franklin 11px caps) and up to 3 other published posts as rule-separated text rows
  (headline + date). No thumbnails in v1, no card chrome.
- **Draft strip** (author/admin viewing an unpublished post): a plain 1px bordered line above the headline,
  Franklin 13px: "Draft. Only you and team admins can see this." Status words in plain English.

### `/news` list page
- Heading "News" in Newsreader 44 / 1.05, one line under it in muted Franklin 15px: "Recaps, analysis and
  news from the DGS Sports Data Analytics Club." Then a hairline.
- **Filter:** text tabs, not pills: All, Game recap, Analysis, News, Opinion. Franklin 14 / 600, 24px apart,
  active has a 2px `--news-accent` underline offset 8px. On phones the row scrolls horizontally with
  `scroll-snap`, hidden scrollbar, no wrap. These are `<a>` links (`?category=`), so they work without JS.
- **Desktop (>= 900px): two columns, 2fr / 1fr, 48px gap, 1px vertical rule between.** Left: the lead story
  (newest post: label, 36px headline, dek, byline line) followed by the next posts as rows. Right: "Latest"
  list: up to 6 headlines only, each with date, separated by hairlines. Phone: single column, lead story
  first, "Latest" column omitted (rows already chronological).
- **Row:** category label, headline, dek clamped to 2 lines (`-webkit-line-clamp`), meta line
  `By Name · 3h ago`. 20px vertical padding, hairline between rows. No card, no radius, no shadow.
  Hover/focus: headline gains a 1px underline (`text-decoration-thickness: 1px`, offset 3px). No lift, no
  colour flood, no animation beyond `text-decoration-color` at 120ms.
- **Pagination:** "Older posts" and "Newer posts" text links, bottom, Franklin 14.
- **Empty state** (no published posts): one sentence, "Nothing published yet.", plus, for members only, a
  "Write the first post" link. For an empty category: "No <category> posts yet." with a link back to All.
- **Error state:** "Couldn't load posts. Refresh to try again." with a button, in the same column width.

### Copy and anti-slop checklist
- Plain sentence case. No "Unlock", "Seamless", "Elevate", "Discover", "Dive in", no exclamation marks, no emoji
  and no emoji-like glyphs (the home page's `⚙` stays out of `/news`). Icons: none; if one is needed later,
  a single consistent 1.5px-stroke set, never mixed.
- No hero banner, no gradient headline, no three-feature-cards row, no pill soup, no skeuomorphic shadows,
  no `rounded-2xl` cards, no animated blobs.
- Hit targets >= 44px on touch. Every interactive thing is a `<button>` or `<a>` with a visible focus ring.
- Respect `prefers-reduced-motion` (there is almost no motion; keep it that way).
- Check at 320px wide: headline wraps without overflow, filter row scrolls, share row wraps onto two lines
  rather than shrinking buttons, long words/URLs in the body use `overflow-wrap: anywhere`.
- Check dark mode on every new surface (the site toggles with a `.dark` class on `<html>`).

### Editor / admin screens (quieter, same system)
Same fonts and hairlines. Inputs: 1px `--news-rule` border, 6px radius, Franklin 15px, 44px tall; the body
textarea uses Newsreader 17 / 1.6 (writers should see roughly what readers get). Status shown as a plain word
with a 8px dot (grey draft, amber submitted, green published), never a coloured badge pill. Review queue
rows mirror the list-row layout plus "Publish" / "Send back" text buttons (primary = filled `#1a775f` with
white text and 6px radius; secondary = outlined).

## 6. Suggested build order (one PR each)

1. Apply migration, fix whatever breaks, write RLS tests (section 7). **Do not start UI before RLS is green.**
2. `src/lib/news/*` helpers + tests, `src/lib/db/news.ts` functions.
3. News layout (fonts, tokens) + `/news` + `/news/[slug]` + metadata + nav + home links. Seed 3 posts by hand to
   judge the design against real text, including a long one, a Vietnamese-title one and one with a blockquote,
   list and link.
4. Editor + `/news/new` + `/news/[slug]/edit`.
5. Workflow pages + actions (`mine`, `review`) + empty/error/loading states.
6. Polish: 320px pass, dark pass, keyboard pass, Lighthouse accessibility.

Branch per PR (`feat/news-...`), draft PR early, squash-merge. Say in the PR when `0007` is the migration
number you took.

## 7. Tests and acceptance

Unit (Vitest, same folder as the code):
- `slugify`: happy path ("Nebraska beats Ohio State" -> `nebraska-beats-ohio-state`); edge: Vietnamese
  ("Đội bóng thắng" -> `doi-bong-thang`), empty/emoji-only -> `post`, 200-char title capped at 60 with no
  trailing dash, repeated punctuation.
- `formatNewsDate`: `Sept.` vs `March`, within 24 h relative, year boundary.
- `wasEdited`: 59 min vs 61 min.
- `plainSummary`: strips markdown, truncates on a word boundary.
- Markdown render: `<script>` and `<img onerror>` stay inert text; `[x](javascript:alert(1))` has no
  `href`; external link gets `rel`; http image rejected.

RLS (create `supabase/tests/news_rls.sql`, run in the SQL editor with `set local role` +
`set local request.jwt.claims`; there is no `verify-rls.sql` in this repo yet, so add this as the first one
and mention it in the README). Fixtures: team A with an admin, a scorekeeper, a player; a stranger (signed in,
no team); anon. For each, assert both allowed and denied:
- anon: sees 0 drafts and 0 submitted rows, sees the published row; insert/update/delete fails with `42501`.
- stranger: same as anon; cannot insert (`42501`).
- player/scorekeeper: can insert `draft` and `submitted`; cannot insert `published` (`42501`); cannot read
  another member's draft (0 rows); can update/delete own draft; can update own submitted;
  **cannot update or delete own published post** (0 rows affected / `42501`); cannot update status to
  `published`; cannot change `slug`, `created_by`, `team_id` (trigger exception).
- admin: reads all statuses; publishes (sets `published_at`); unpublishes; edits and deletes any post.
- backfilled legacy rows are `published` with a slug.

**Prove the tests are real** (house rule): temporarily replace the `news read` policy with `using (true)`
and show the "anon sees 0 drafts" assertion fail; drop the `with check` status clause and show the "cannot
publish own post" assertion fail. Restore, show green. Report the before/after in the PR.

Acceptance (manual, on a Vercel preview, phone width and desktop, light and dark):
1. A player writes a post, saves, submits. Anon cannot open `/news/<slug>` (404) while it is submitted.
2. An admin sees it in `/news/review`, publishes it. It appears at `/news`, the home page, and opens by link
   when signed out. Sharing the link in a chat shows the title and summary.
3. The author can no longer edit it; the admin can, and "Updated ..." appears after an hour-later edit.
4. Pasting `<script>alert(1)</script>` in a body shows literal text.
5. Existing pre-blog news items appear as published posts with working URLs.
6. `npm test`, `npm run lint`, `npm run build` pass.

## 8. Out of scope for this feature (later PRs)

Image uploads (Supabase Storage bucket, size/type limits, RLS on the bucket, cover images, hero slot with
caption + credit), linking a post to a game and rendering its box score, RSS, an author page, a friendlier
editor for non-technical writers (replace `BodyEditor`), non-team authors (needs a role), comments.
Dropping the root `force-dynamic` so `/news` can be cached: worth doing, but it touches every page, so
separate PR; until then `/news` is rendered per request.
