-- Latest News posts (written by team admins) and Contact Us messages.

create table public.news_posts (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 140),
  body        text not null check (char_length(body) between 1 and 4000),
  created_by  uuid not null default auth.uid() references auth.users (id),
  created_at  timestamptz not null default now()
);
create index news_posts_team_idx on public.news_posts (team_id, created_at desc);

alter table public.news_posts enable row level security;

create policy "news readable" on public.news_posts for select using (true);
create policy "news admins write" on public.news_posts for all to authenticated
  using (public.is_team_admin(team_id)) with check (public.is_team_admin(team_id));

-- Anyone (signed in or not) can send a message; only team admins can read or delete them.
create table public.contact_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  email       text not null check (char_length(email) between 3 and 254 and email like '%@%'),
  message     text not null check (char_length(message) between 1 and 4000),
  created_at  timestamptz not null default now()
);
create index contact_messages_created_idx on public.contact_messages (created_at desc);

alter table public.contact_messages enable row level security;

create or replace function public.is_any_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members where user_id = auth.uid() and role = 'admin');
$$;

create policy "contact anyone can send" on public.contact_messages for insert
  to anon, authenticated with check (true);
create policy "contact admins read" on public.contact_messages for select
  to authenticated using (public.is_any_admin());
create policy "contact admins delete" on public.contact_messages for delete
  to authenticated using (public.is_any_admin());
