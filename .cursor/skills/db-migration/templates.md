# Migration templates

Patterns taken from `supabase/migrations/20260927170337_create_core_tables.sql`. Copy the
shape, then decide each grant and policy deliberately. Write a comment wherever a policy is
intentionally absent, and say who performs that operation instead.

## Grants

```sql
-- Grants decide whether a role may touch a table at all; policies then decide which rows.
revoke all on table public.things from anon, authenticated;

grant select, insert, delete on table public.things to authenticated;
-- Column-level update keeps id, org_id, user_id and created_at immutable from the API.
grant update (name, notes) on table public.things to authenticated;

grant select, insert, update, delete on table public.things to service_role;
```

`anon` gets nothing unless a public surface needs it (share links in Phase 3), and that
needs a reason in the comment.

## Row level security and policies

Use one policy per operation, scoped `to authenticated`, and name it
`"<table>: <rule in words>"`. Wrap every helper and `auth.uid()` call as `(select ...)`.

```sql
alter table public.things enable row level security;

create policy "things: read own, or all if manager"
on public.things for select to authenticated
using (
  org_id in (select private.my_org_ids())
  and (
    user_id = (select auth.uid())
    or org_id in (select private.my_managed_org_ids())
  )
);

create policy "things: insert own into own org"
on public.things for insert to authenticated
with check (
  org_id in (select private.my_org_ids())
  and user_id = (select auth.uid())
);

create policy "things: update own"
on public.things for update to authenticated
using (org_id in (select private.my_org_ids()) and user_id = (select auth.uid()))
with check (org_id in (select private.my_org_ids()) and user_id = (select auth.uid()));

create policy "things: delete own"
on public.things for delete to authenticated
using (org_id in (select private.my_org_ids()) and user_id = (select auth.uid()));
```

Existing helpers: `private.my_org_ids()` and `private.my_managed_org_ids()`. Neither takes
an argument, so both are cached as InitPlans.

## Security definer function in the private schema

```sql
-- <Why this needs owner privileges, e.g. reading memberships without recursing into its
-- own policies.>
create function private.do_thing()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select ... from public.some_table where user_id = (select auth.uid());
$$;

revoke execute on function private.do_thing() from public, anon;
grant execute on function private.do_thing() to authenticated;  -- only if a policy calls it
```

With `search_path = ''`, every name must be schema-qualified (`public.x`, `auth.uid()`).
No API role is granted usage on `private`, and policies still work without it.

## updated_at trigger

```sql
create trigger things_set_updated_at
before update on public.things
for each row execute function private.set_updated_at();
```

## pgTAP test skeleton

```sql
-- <Which invariant from docs/security.md this file proves, and the cast of users.>

begin;
create extension if not exists pgtap with schema extensions;

select plan(3);

-- Fixtures, created as postgres. Use fixed, readable uuids, and filter assertions by them
-- so that seed data and the signup trigger don't change the counts.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'bob@test.local');
-- ... organizations, memberships, rows under test ...

-- Impersonate exactly as PostgREST does.
set local role authenticated;
set local request.jwt.claims to '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

select results_eq(
  $$ select id from public.things where org_id = '<fixture org>' order by id $$,
  $$ values ('<bob thing id>'::uuid) $$,
  'invariant N: <the guarantee, in words>'
);

select is_empty(
  $$ update public.things set name = 'x' where id = '<alice thing id>' returning id $$,
  'a member cannot update someone else''s thing; it is invisible, so zero rows'
);

select throws_ok(
  $$ insert into public.things (org_id, user_id, name)
     values ('<other org>', '22222222-2222-2222-2222-222222222222', 'x') $$,
  '42501',
  null,
  'a member cannot insert into an org they do not belong to'
);

-- Return to postgres, which bypasses RLS, to check what actually happened.
reset role;

select * from finish();
rollback;
```

Write the descriptions so they name the guarantee, not the mechanism. Keep the test green
if any single layer (grant, policy or foreign key) still holds, and make it go red only
when the guarantee itself breaks.
