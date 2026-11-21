-- Team membership helpers. Emails live in auth.users, which the browser can't read,
-- so these SECURITY DEFINER functions expose just what the Team page needs.

-- Members of a team with their emails (visible to members of that team only).
create or replace function public.team_members_with_email(p_team uuid)
returns table (user_id uuid, email text, role text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.user_id, u.email::text, m.role, m.created_at
  from team_members m
  join auth.users u on u.id = m.user_id
  where m.team_id = p_team and public.is_team_member(p_team)
  order by m.created_at;
$$;

-- Admins add a scorekeeper by email. The person must have signed in once already.
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
  if p_role not in ('admin', 'scorekeeper') then
    raise exception 'Unknown role %', p_role;
  end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'No account uses % yet. Ask them to sign in once, then add them again.', p_email;
  end if;
  insert into team_members (team_id, user_id, role)
  values (p_team, v_user, p_role)
  on conflict (team_id, user_id) do update set role = excluded.role;
end $$;

grant execute on function public.team_members_with_email(uuid) to authenticated;
grant execute on function public.add_team_member_by_email(uuid, text, text) to authenticated;
