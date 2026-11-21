-- Newer Supabase projects no longer grant table privileges to the API roles
-- automatically, so every query fails with "permission denied for table ...".
-- These are the standard Supabase grants; row-level security (the policies in
-- 0001–0003) still decides which rows each role can actually read or write.

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;

-- Tables added by future migrations get the same grants.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated;
alter default privileges in schema public
  grant execute on functions to anon, authenticated;
