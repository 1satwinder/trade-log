-- Schema-wide guarantees from docs/security.md that do not depend on any particular row:
-- invariant 6 (private helpers are not callable by anon) and invariant 7 (every public
-- table has RLS), plus the grant layer from ADR-0011. These query the catalogue, so a new
-- table that forgets its RLS, policies or grants fails here without anyone writing a test
-- for it.

begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

select is_empty(
  $$
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
  $$,
  'invariant 7: every table in public has row level security enabled'
);

select is_empty(
  $$
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
  $$,
  'every table in public has at least one policy'
);

select is_empty(
  $$
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and has_table_privilege('anon', c.oid, 'select, insert, update, delete, truncate')
  $$,
  'anon holds no privileges on any table in public'
);

select is_empty(
  $$
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and has_table_privilege('authenticated', c.oid, 'truncate')
  $$,
  'authenticated cannot truncate any table, since truncate ignores row level security'
);

select is_empty(
  $$
    select p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and has_function_privilege('anon', p.oid, 'execute')
  $$,
  'invariant 6: anon cannot execute any function in the private schema'
);

select is_empty(
  $$
    select p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.prosecdef
      and not coalesce(p.proconfig @> array['search_path=""'], false)
  $$,
  'every security definer helper pins an empty search_path'
);

select ok(
  not has_schema_privilege('anon', 'private', 'usage')
    and not has_schema_privilege('authenticated', 'private', 'usage'),
  'no API role has usage on the private schema'
);

set local role anon;

select throws_ok(
  'select private.my_org_ids()',
  '42501',
  null,
  'invariant 6: calling a private helper as anon is refused'
);

select throws_ok(
  'select * from public.trades',
  '42501',
  null,
  'anon reading trades is refused by the grant layer, before RLS is consulted'
);

reset role;

select * from finish();
rollback;
