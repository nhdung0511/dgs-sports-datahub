-- Sports news blog: turns the admin-only "Latest news" items into full posts with an
-- author workflow (draft -> submitted -> published). See PLAN.md and docs/news-blog-handoff.md.
--
-- Who can do what (RLS is the only real boundary; the UI mirrors it but never enforces it):
--   anyone (anon included)  read published posts only
--   team member (any role)  create posts as draft/submitted, edit and delete OWN drafts,
--                           edit own post while submitted, read own posts in any status
--   team admin              everything: read all, publish, unpublish, edit, delete
-- A non-admin author cannot edit a post once it is published (the update policy's USING clause
-- no longer matches it) and cannot set status = 'published' (the WITH CHECK clause rejects it).

-- ---------------------------------------------------------------- columns
alter table public.news_posts
  add column if not exists slug         text,
  add column if not exists summary      text,
  add column if not exists category     text not null default 'news',
  add column if not exists status       text not null default 'draft',
  -- Byline is typed per post. Emails live in auth.users and must never reach a public page.
  add column if not exists author_name  text not null default 'DGS Sports Datahub',
  add column if not exists published_at timestamptz,
  add column if not exists updated_at   timestamptz not null default now();

-- Posts are markdown now; the old 4000-character plain-text cap is too small.
alter table public.news_posts drop constraint if exists news_posts_body_check;
alter table public.news_posts
  add constraint news_posts_body_len check (char_length(body) between 1 and 50000),
  add constraint news_posts_summary_len check (summary is null or char_length(summary) <= 300),
  add constraint news_posts_author_len check (char_length(author_name) between 1 and 80),
  add constraint news_posts_category_check check (category in ('recap', 'analysis', 'news', 'opinion')),
  add constraint news_posts_status_check check (status in ('draft', 'submitted', 'published'));

-- ---------------------------------------------------------------- slug helper
-- ASCII-only on purpose (no `unaccent` extension needed). The app transliterates diacritics
-- (e.g. Vietnamese "đ", "ư") BEFORE saving, so this only matters as a fallback and for the backfill.
create or replace function public.slugify(t text) returns text
language sql immutable as $$
  select coalesce(nullif(
    left(
      regexp_replace(
        regexp_replace(lower(trim(coalesce(t, ''))), '[^a-z0-9]+', '-', 'g'),
        '(^-+|-+$)', '', 'g'
      ),
      60
    ),
    ''
  ), 'post');
$$;

-- ---------------------------------------------------------------- backfill
-- Existing posts were visible to everyone, so they stay published. The id suffix guarantees
-- uniqueness without a retry loop.
update public.news_posts
set slug = public.slugify(title) || '-' || left(id::text, 8),
    status = 'published',
    published_at = created_at,
    updated_at = created_at
where slug is null;

alter table public.news_posts alter column slug set not null;
create unique index if not exists news_posts_slug_key on public.news_posts (slug);
create index if not exists news_posts_status_idx on public.news_posts (status, published_at desc);

-- ---------------------------------------------------------------- triggers
create or replace function public.news_posts_before_write() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    -- Fallback for callers that don't send a slug (the pre-blog home-page form did not).
    if new.slug is null or new.slug = '' then
      new.slug := public.slugify(new.title) || '-' || left(new.id::text, 8);
    end if;
  else
    -- A slug is a public URL: changing it later would break every shared link.
    if new.slug is distinct from old.slug then
      raise exception 'A post''s slug cannot change.';
    end if;
    -- Ownership and team are fixed at creation, even for admins.
    if new.created_by is distinct from old.created_by or new.team_id is distinct from old.team_id then
      raise exception 'A post''s author and team cannot change.';
    end if;
  end if;

  -- First time it goes live. Kept if it is later unpublished and republished, so the
  -- original publication date survives.
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;

  new.updated_at := now();
  return new;
end $$;

drop trigger if exists news_posts_before_write on public.news_posts;
create trigger news_posts_before_write before insert or update on public.news_posts
  for each row execute function public.news_posts_before_write();

-- ---------------------------------------------------------------- RLS
alter table public.news_posts enable row level security;

drop policy if exists "news readable" on public.news_posts;
drop policy if exists "news admins write" on public.news_posts;
drop policy if exists "news read" on public.news_posts;
drop policy if exists "news insert" on public.news_posts;
drop policy if exists "news update" on public.news_posts;
drop policy if exists "news delete" on public.news_posts;

-- auth.uid() is null for anon, so `created_by = auth.uid()` is never true for them:
-- anon sees published posts only.
create policy "news read" on public.news_posts for select
  using (status = 'published' or created_by = auth.uid() or public.is_team_admin(team_id));

create policy "news insert" on public.news_posts for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.is_team_member(team_id)
    and (status in ('draft', 'submitted') or public.is_team_admin(team_id))
  );

create policy "news update" on public.news_posts for update to authenticated
  using (
    public.is_team_admin(team_id)
    or (created_by = auth.uid() and status in ('draft', 'submitted') and public.is_team_member(team_id))
  )
  with check (
    public.is_team_admin(team_id)
    or (created_by = auth.uid() and status in ('draft', 'submitted') and public.is_team_member(team_id))
  );

create policy "news delete" on public.news_posts for delete to authenticated
  using (
    public.is_team_admin(team_id)
    or (created_by = auth.uid() and status = 'draft')
  );

-- 0004 grants every table to anon by default. Revoke writes from anon BY NAME
-- (revoking from `public` would not remove Supabase's direct grant); anon keeps select
-- so published posts stay public, and RLS limits those rows.
revoke insert, update, delete on public.news_posts from anon;
grant select, insert, update, delete on public.news_posts to authenticated;
