-- Coach view (docs/coach-view-plan.md): a "coach" role and the team's live-alert thresholds.
-- Coaches are editors (create games, edit the roster, keep score) and can see the coach view.
-- Members, news and archetypes stay admin-only.

alter table public.team_members drop constraint if exists team_members_role_check;
alter table public.team_members
  add constraint team_members_role_check check (role in ('admin', 'coach', 'scorekeeper', 'player'));

-- Editors: admins, coaches and scorekeepers.
create or replace function public.is_team_editor(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from team_members
    where team_id = t and user_id = auth.uid() and role in ('admin', 'coach', 'scorekeeper')
  );
$$;

-- Coach view access: admins and coaches.
create or replace function public.is_team_coach(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from team_members
    where team_id = t and user_id = auth.uid() and role in ('admin', 'coach')
  );
$$;
grant execute on function public.is_team_coach(uuid) to authenticated;

create or replace function public.add_team_member_by_email(
  p_team uuid,
  p_email text,
  p_role text default 'scorekeeper'
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
begin
  if not public.is_team_admin(p_team) then
    raise exception 'Only team admins can add members.';
  end if;
  if p_role not in ('admin', 'coach', 'scorekeeper', 'player') then
    raise exception 'Unknown role %', p_role;
  end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'No account uses % yet. Create it in Supabase (Authentication > Users) or ask them to sign in once, then add them again.', p_email;
  end if;
  insert into team_members (team_id, user_id, role)
  values (p_team, v_user, p_role)
  on conflict (team_id, user_id) do update set role = excluded.role;
end $$;

-- Alert thresholds the team changed from the app's defaults (missing keys use the defaults).
create table if not exists public.coach_thresholds (
  team_id    uuid primary key references public.teams (id) on delete cascade,
  "values"   jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.coach_thresholds enable row level security;

drop policy if exists "coach thresholds read" on public.coach_thresholds;
create policy "coach thresholds read" on public.coach_thresholds for select to authenticated
  using (public.is_team_coach(team_id));
drop policy if exists "coach thresholds write" on public.coach_thresholds;
create policy "coach thresholds write" on public.coach_thresholds for all to authenticated
  using (public.is_team_coach(team_id)) with check (public.is_team_coach(team_id));

grant select, insert, update, delete on public.coach_thresholds to authenticated;
