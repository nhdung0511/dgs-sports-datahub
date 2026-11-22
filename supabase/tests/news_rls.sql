-- RLS tests for news_posts (migration 0007). Run in the Supabase SQL editor or:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/news_rls.sql
-- Everything runs in one transaction that is rolled back, so it leaves no data behind.
-- Any failed assertion raises an exception and aborts the run; "NEWS RLS OK" means all passed.
begin;

-- --------------------------------------------------------------- helpers
create function pg_temp.act_as(who uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', case when who is null then '' else json_build_object('sub', who)::text end, true);
  execute case when who is null then 'set local role anon' else 'set local role authenticated' end;
end $$;

create function pg_temp.reset() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims', '', true); end $$;

create function pg_temp.assert(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if; end $$;

-- Runs sql as `who` and returns the SQLSTATE it failed with, or 'ok'.
create function pg_temp.try(who uuid, q text) returns text language plpgsql as $$
declare r text;
begin
  perform pg_temp.act_as(who);
  begin execute q; r := 'ok';
  exception when others then r := sqlstate; end;
  perform pg_temp.reset();
  return r;
end $$;

-- Counts rows visible to `who` for a where clause.
create function pg_temp.seen(who uuid, cond text) returns bigint language plpgsql as $$
declare n bigint;
begin
  perform pg_temp.act_as(who);
  execute 'select count(*) from public.news_posts where ' || cond into n;
  perform pg_temp.reset();
  return n;
end $$;

-- Rows changed by an update/delete run as `who` (RLS filters silently, so 0 means "denied").
create function pg_temp.changed(who uuid, q text) returns bigint language plpgsql as $$
declare n bigint;
begin
  perform pg_temp.act_as(who);
  execute q;
  get diagnostics n = row_count;
  perform pg_temp.reset();
  return n;
end $$;

-- --------------------------------------------------------------- fixtures
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@t'),
  ('00000000-0000-0000-0000-0000000000a2', 'keeper@t'),
  ('00000000-0000-0000-0000-0000000000a3', 'player@t'),
  ('00000000-0000-0000-0000-0000000000a4', 'player2@t'),
  ('00000000-0000-0000-0000-0000000000a5', 'stranger@t');

insert into public.teams (id, name, created_by) values
  ('00000000-0000-0000-0000-0000000000b1', 'Team A', '00000000-0000-0000-0000-0000000000a1');
-- The creator trigger already made a1 an admin.
insert into public.team_members (team_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2', 'scorekeeper'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a3', 'player'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a4', 'player');

-- Legacy row as it existed before 0007 would have been backfilled; simulate the end state via the
-- backfill rule by inserting without a slug and checking the trigger fallback.
insert into public.news_posts (id, team_id, title, body, created_by, status, author_name) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'Published one', 'x', '00000000-0000-0000-0000-0000000000a1', 'published', 'Admin'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1', 'Draft by player', 'x', '00000000-0000-0000-0000-0000000000a3', 'draft', 'P'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000b1', 'Submitted by player', 'x', '00000000-0000-0000-0000-0000000000a3', 'submitted', 'P'),
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000b1', 'Published by player', 'x', '00000000-0000-0000-0000-0000000000a3', 'published', 'P');

do $$
declare
  admin  constant uuid := '00000000-0000-0000-0000-0000000000a1';
  keeper constant uuid := '00000000-0000-0000-0000-0000000000a2';
  player constant uuid := '00000000-0000-0000-0000-0000000000a3';
  player2 constant uuid := '00000000-0000-0000-0000-0000000000a4';
  stranger constant uuid := '00000000-0000-0000-0000-0000000000a5';
  team constant uuid := '00000000-0000-0000-0000-0000000000b1';
  ins text := format($f$insert into public.news_posts (team_id, title, body, created_by, status, author_name, slug)
                        values (%L, 't', 'b', %%L, %%L, 'n', %%L)$f$, team);
begin
  -- trigger fallback gave the slug-less rows a slug
  perform pg_temp.assert((select count(*) from public.news_posts where slug is null or slug = '') = 0, 'every row has a slug');

  -- ---------------------------------------------------------- anon
  perform pg_temp.assert(pg_temp.seen(null, $c$status = 'published'$c$) = 2, 'anon sees published rows');
  perform pg_temp.assert(pg_temp.seen(null, $c$status <> 'published'$c$) = 0, 'anon sees 0 drafts/submitted');
  perform pg_temp.assert(pg_temp.try(null, format(ins, player, 'draft', 'anon-1')) = '42501', 'anon cannot insert');
  perform pg_temp.assert(pg_temp.try(null, $q$update public.news_posts set title = 'hax'$q$) = '42501', 'anon cannot update (privilege)');
  perform pg_temp.assert(pg_temp.try(null, $q$delete from public.news_posts$q$) = '42501', 'anon cannot delete (privilege)');

  -- ---------------------------------------------------------- stranger (signed in, no team)
  perform pg_temp.assert(pg_temp.seen(stranger, $c$status <> 'published'$c$) = 0, 'stranger sees 0 drafts/submitted');
  perform pg_temp.assert(pg_temp.seen(stranger, $c$status = 'published'$c$) = 2, 'stranger sees published');
  perform pg_temp.assert(pg_temp.try(stranger, format(ins, stranger, 'draft', 's-1')) = '42501', 'stranger cannot insert');
  perform pg_temp.assert(pg_temp.changed(stranger, $q$update public.news_posts set title = 'hax'$q$) = 0, 'stranger updates 0 rows');
  perform pg_temp.assert(pg_temp.changed(stranger, $q$delete from public.news_posts$q$) = 0, 'stranger deletes 0 rows');

  -- ---------------------------------------------------------- player / scorekeeper
  perform pg_temp.assert(pg_temp.try(player, format(ins, player, 'draft', 'p-draft')) = 'ok', 'player inserts draft');
  perform pg_temp.assert(pg_temp.try(keeper, format(ins, keeper, 'submitted', 'k-sub')) = 'ok', 'scorekeeper inserts submitted');
  perform pg_temp.assert(pg_temp.try(player, format(ins, player, 'published', 'p-pub')) = '42501', 'player cannot insert published');
  perform pg_temp.assert(pg_temp.try(player, format(ins, admin, 'draft', 'p-spoof')) = '42501', 'player cannot post as someone else');
  perform pg_temp.assert(pg_temp.seen(player2, $c$status <> 'published'$c$) = 0, 'other player cannot read my drafts');
  perform pg_temp.assert(pg_temp.seen(player, $c$status = 'draft' and created_by = auth.uid()$c$) = 2, 'player reads own drafts');
  perform pg_temp.assert(pg_temp.changed(player, $q$update public.news_posts set title = 'edited' where id = '00000000-0000-0000-0000-0000000000c2'$q$) = 1, 'player edits own draft');
  perform pg_temp.assert(pg_temp.changed(player, $q$update public.news_posts set title = 'edited' where id = '00000000-0000-0000-0000-0000000000c3'$q$) = 1, 'player edits own submitted');
  perform pg_temp.assert(pg_temp.try(player, $q$update public.news_posts set status = 'published' where id = '00000000-0000-0000-0000-0000000000c3'$q$) = '42501', 'player cannot publish own post');
  perform pg_temp.assert(pg_temp.changed(player, $q$update public.news_posts set title = 'edited' where id = '00000000-0000-0000-0000-0000000000c4'$q$) = 0, 'player cannot edit own published post');
  perform pg_temp.assert(pg_temp.changed(player, $q$delete from public.news_posts where id = '00000000-0000-0000-0000-0000000000c4'$q$) = 0, 'player cannot delete own published post');
  perform pg_temp.assert(pg_temp.changed(player, $q$delete from public.news_posts where id = '00000000-0000-0000-0000-0000000000c3'$q$) = 0, 'player cannot delete own submitted post');
  perform pg_temp.assert(pg_temp.changed(player2, $q$update public.news_posts set title = 'hax' where id = '00000000-0000-0000-0000-0000000000c2'$q$) = 0, 'player cannot edit another draft');
  -- immutable columns (trigger raises a plain exception, P0001)
  perform pg_temp.assert(pg_temp.try(player, $q$update public.news_posts set slug = 'new' where id = '00000000-0000-0000-0000-0000000000c2'$q$) = 'P0001', 'slug is immutable');
  perform pg_temp.assert(pg_temp.try(player, $q$update public.news_posts set created_by = '00000000-0000-0000-0000-0000000000a4' where id = '00000000-0000-0000-0000-0000000000c2'$q$) = 'P0001', 'created_by is immutable');
  perform pg_temp.assert(pg_temp.changed(player, $q$delete from public.news_posts where id = '00000000-0000-0000-0000-0000000000c2'$q$) = 1, 'player deletes own draft');

  -- ---------------------------------------------------------- admin
  perform pg_temp.assert(pg_temp.seen(admin, 'true') = (select count(*) from public.news_posts), 'admin reads all statuses');
  perform pg_temp.assert(pg_temp.changed(admin, $q$update public.news_posts set status = 'published' where id = '00000000-0000-0000-0000-0000000000c3'$q$) = 1, 'admin publishes');
  perform pg_temp.assert((select published_at is not null from public.news_posts where id = '00000000-0000-0000-0000-0000000000c3'), 'publish sets published_at');
  perform pg_temp.assert(pg_temp.seen(null, $c$id = '00000000-0000-0000-0000-0000000000c3'$c$) = 1, 'published post is now public');
  perform pg_temp.assert(pg_temp.changed(admin, $q$update public.news_posts set status = 'draft' where id = '00000000-0000-0000-0000-0000000000c3'$q$) = 1, 'admin unpublishes');
  perform pg_temp.assert(pg_temp.seen(null, $c$id = '00000000-0000-0000-0000-0000000000c3'$c$) = 0, 'unpublished post is hidden again');
  perform pg_temp.assert((select published_at is not null from public.news_posts where id = '00000000-0000-0000-0000-0000000000c3'), 'published_at survives unpublish');
  perform pg_temp.assert(pg_temp.changed(admin, $q$update public.news_posts set title = 'edited' where id = '00000000-0000-0000-0000-0000000000c4'$q$) = 1, 'admin edits published post by someone else');
  perform pg_temp.assert(pg_temp.changed(admin, $q$delete from public.news_posts where id = '00000000-0000-0000-0000-0000000000c4'$q$) = 1, 'admin deletes any post');
  perform pg_temp.assert(pg_temp.try(admin, format(ins, admin, 'published', 'a-pub')) = 'ok', 'admin inserts published');
  raise notice 'NEWS RLS OK';
end $$;

rollback;
