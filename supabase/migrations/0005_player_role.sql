-- View-only "player" role: players sign in to see team-only analysis but can't change anything.
-- Writes that used to need any team membership now need an admin or scorekeeper ("editor").

alter table public.team_members drop constraint if exists team_members_role_check;
alter table public.team_members
  add constraint team_members_role_check check (role in ('admin', 'scorekeeper', 'player'));

-- Admins and scorekeepers: the members allowed to change team data.
create or replace function public.is_team_editor(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from team_members
    where team_id = t and user_id = auth.uid() and role in ('admin', 'scorekeeper')
  );
$$;
grant execute on function public.is_team_editor(uuid) to anon, authenticated;

drop policy if exists "players write" on public.players;
create policy "players write" on public.players for all to authenticated
  using (public.is_team_editor(team_id)) with check (public.is_team_editor(team_id));

drop policy if exists "games write" on public.games;
create policy "games write" on public.games for all to authenticated
  using (public.is_team_editor(team_id)) with check (public.is_team_editor(team_id));

-- Still only the game's scorekeeper, and only while they're an editor (not demoted to player).
drop policy if exists "events write" on public.game_events;
create policy "events write" on public.game_events for all to authenticated
  using (exists (
    select 1 from public.games g
    where g.id = game_id and g.scorekeeper_id = auth.uid() and public.is_team_editor(g.team_id)
  ))
  with check (exists (
    select 1 from public.games g
    where g.id = game_id and g.scorekeeper_id = auth.uid() and public.is_team_editor(g.team_id)
  ));

-- Admins can now add players (view-only) as well as scorekeepers and admins.
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
  if p_role not in ('admin', 'scorekeeper', 'player') then
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
