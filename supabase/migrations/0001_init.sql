-- Sports tracker: initial schema.
-- Generic core (teams, players, games, events) shared by every sport.
-- Sport-specific detail lives in games.config and game_events.type / payload.
-- Run in Supabase SQL Editor, or `supabase db push` with the Supabase CLI.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- The club team we track in detail (opponents are just a name on the game).
create table public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sport       text not null default 'basketball',
  created_by  uuid not null default auth.uid() references auth.users (id),
  created_at  timestamptz not null default now()
);

-- Scorekeepers / admins allowed to edit a team and its games.
create table public.team_members (
  team_id     uuid not null references public.teams (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null default 'scorekeeper' check (role in ('admin', 'scorekeeper')),
  created_at  timestamptz not null default now(),
  primary key (team_id, user_id)
);

-- Saved roster, reused across games for season stats.
create table public.players (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id) on delete cascade,
  name        text not null,
  jersey      text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index players_team_idx on public.players (team_id);

create table public.games (
  id             uuid primary key default gen_random_uuid(),  -- unguessable: the public link
  team_id        uuid not null references public.teams (id) on delete cascade,
  sport          text not null default 'basketball',
  opponent_name  text not null,
  starts_at      timestamptz,
  status         text not null default 'scheduled' check (status in ('scheduled', 'live', 'final')),
  -- Basketball example: {"periodCount":4,"periodLengthSec":600,"overtimeLengthSec":300}
  config         jsonb not null default '{}'::jsonb,
  -- One scorekeeper per game: only this user may write events.
  scorekeeper_id uuid references auth.users (id),
  created_at     timestamptz not null default now()
);
create index games_team_idx on public.games (team_id, starts_at desc);

-- Append-only-ish event log. Box scores are always recomputed from this.
-- id is generated on the device so offline retries are idempotent (upsert on id).
create table public.game_events (
  id          uuid primary key,
  game_id     uuid not null references public.games (id) on delete cascade,
  seq         integer not null,             -- device-assigned order within the game
  period      integer not null,
  clock_ms    integer not null,             -- game clock remaining in the period
  side        text not null check (side in ('us', 'opp')),
  type        text not null,                -- sport-specific, e.g. 'shot', 'sub'
  player_id   uuid references public.players (id),
  payload     jsonb not null default '{}'::jsonb,
  deleted     boolean not null default false,  -- soft delete keeps edits syncable
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (game_id, seq)
);
create index game_events_game_idx on public.game_events (game_id, seq);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger game_events_touch before update on public.game_events
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- Read: anyone (games are public via link). Write: team members only,
-- and events only by the game's assigned scorekeeper.
-- ---------------------------------------------------------------------------

create or replace function public.is_team_member(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members where team_id = t and user_id = auth.uid());
$$;

create or replace function public.is_team_admin(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from team_members where team_id = t and user_id = auth.uid() and role = 'admin'
  );
$$;

-- Creator of a team becomes its admin automatically.
create or replace function public.add_team_creator() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into team_members (team_id, user_id, role) values (new.id, new.created_by, 'admin');
  return new;
end $$;

create trigger teams_add_creator after insert on public.teams
  for each row execute function public.add_team_creator();

alter table public.teams        enable row level security;
alter table public.team_members enable row level security;
alter table public.players      enable row level security;
alter table public.games        enable row level security;
alter table public.game_events  enable row level security;

create policy "teams readable"   on public.teams for select using (true);
create policy "teams insert"     on public.teams for insert to authenticated with check (created_by = auth.uid());
create policy "teams update"     on public.teams for update to authenticated using (public.is_team_admin(id));
create policy "teams delete"     on public.teams for delete to authenticated using (public.is_team_admin(id));

create policy "members readable" on public.team_members for select to authenticated using (public.is_team_member(team_id));
create policy "members manage"   on public.team_members for all to authenticated
  using (public.is_team_admin(team_id)) with check (public.is_team_admin(team_id));

create policy "players readable" on public.players for select using (true);
create policy "players write"    on public.players for all to authenticated
  using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));

create policy "games readable"   on public.games for select using (true);
create policy "games write"      on public.games for all to authenticated
  using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));

create policy "events readable"  on public.game_events for select using (true);
create policy "events write"     on public.game_events for all to authenticated
  using (exists (select 1 from public.games g where g.id = game_id and g.scorekeeper_id = auth.uid()))
  with check (exists (select 1 from public.games g where g.id = game_id and g.scorekeeper_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Realtime: public viewers subscribe to these for live updates.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.games, public.game_events;
