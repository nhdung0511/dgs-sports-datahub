-- Stage 4 of docs/analysis-plan.md: benchmark targets, player archetypes and who plays which.
-- Everything here is team-only (like the Analysis tab): members read, admins write.
-- Built-in defaults live in the app; these tables only hold the team's own changes.

-- Team targets per metric (overrides the app's default benchmark for that metric).
create table public.benchmarks (
  team_id     uuid not null references public.teams (id) on delete cascade,
  metric_key  text not null,
  target      numeric not null,
  updated_at  timestamptz not null default now(),
  primary key (team_id, metric_key)
);

-- Archetypes: a name and the key stats (with a goal for each) that define the role.
-- metrics: [{"key": "tsPct", "goal": 55}, ...] in display order.
create table public.archetypes (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id) on delete cascade,
  name        text not null,
  description text not null default '',
  metrics     jsonb not null default '[]'::jsonb,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);
create index archetypes_team_idx on public.archetypes (team_id, sort_order);

-- The archetype a coach assigned to each player (none = use auto-detection only).
create table public.player_archetypes (
  player_id    uuid primary key references public.players (id) on delete cascade,
  team_id      uuid not null references public.teams (id) on delete cascade,
  archetype_id uuid not null references public.archetypes (id) on delete cascade
);

alter table public.benchmarks        enable row level security;
alter table public.archetypes        enable row level security;
alter table public.player_archetypes enable row level security;

create policy "benchmarks team read"  on public.benchmarks for select to authenticated using (public.is_team_member(team_id));
create policy "benchmarks admin write" on public.benchmarks for all to authenticated
  using (public.is_team_admin(team_id)) with check (public.is_team_admin(team_id));

create policy "archetypes team read"  on public.archetypes for select to authenticated using (public.is_team_member(team_id));
create policy "archetypes admin write" on public.archetypes for all to authenticated
  using (public.is_team_admin(team_id)) with check (public.is_team_admin(team_id));

create policy "player archetypes team read"  on public.player_archetypes for select to authenticated
  using (public.is_team_member(team_id));
create policy "player archetypes admin write" on public.player_archetypes for all to authenticated
  using (public.is_team_admin(team_id)) with check (public.is_team_admin(team_id));

grant select, insert, update, delete on public.benchmarks, public.archetypes, public.player_archetypes to authenticated;
