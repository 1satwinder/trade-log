-- Tenant isolation, invariants 1 to 4 in docs/security.md.
--
-- Cast: Alice owns the "Desk" org, where Bob and Dave are members. Carol owns "Solo", a
-- different org. Each has one account and one trade.
--
-- Impersonation is exactly what PostgREST does per request: switch to the authenticated
-- role and set the JWT claims that auth.uid() reads. `reset role` returns to postgres,
-- which bypasses RLS, for setup and for checking what really happened. Everything is
-- rolled back at the end.
--
-- Assertions filter by the fixture ids rather than counting whole tables, so they keep
-- holding when seed data or the signup trigger adds rows of their own.
--
-- They assert outcomes, not mechanisms. Reassigning a trade's owner is refused both by the
-- missing column grant and by the update policy's with check, so this file stays green if
-- either layer alone is removed; it goes red only when the user-visible guarantee breaks.

begin;
create extension if not exists pgtap with schema extensions;

select plan(35);

-- --- Fixtures, created as postgres ------------------------------------------------------

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'bob@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'carol@test.local'),
  ('44444444-4444-4444-4444-444444444444', 'dave@test.local');

-- The signup trigger has already created these profiles, plus a personal org and account
-- per user that no assertion below touches. Inserting them anyway keeps the fixtures
-- readable without the trigger.
insert into public.profiles (id, display_name) values
  ('11111111-1111-1111-1111-111111111111', 'Alice'),
  ('22222222-2222-2222-2222-222222222222', 'Bob'),
  ('33333333-3333-3333-3333-333333333333', 'Carol'),
  ('44444444-4444-4444-4444-444444444444', 'Dave')
on conflict (id) do nothing;

insert into public.organizations (id, name, slug) values
  ('d0000000-0000-0000-0000-000000000001', 'Desk', 'test-desk'),
  ('d0000000-0000-0000-0000-000000000002', 'Solo', 'test-solo');

insert into public.memberships (org_id, user_id, role) values
  ('d0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('d0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'member'),
  ('d0000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'member'),
  ('d0000000-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', 'owner');

insert into public.accounts (id, org_id, user_id, name) values
  ('ac000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Test'),
  ('ac000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Test'),
  ('ac000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'Test'),
  ('ac000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', 'Test');

-- updated_at is backdated so the trigger's effect is visible inside one transaction, where
-- now() never moves.
insert into public.trades (id, org_id, account_id, user_id, symbol, side, quantity, entry_price, entry_at, updated_at) values
  ('f0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'AAPL', 'long', 10, 190, now(), now() - interval '1 day'),
  ('f0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'MSFT', 'long', 5, 410, now(), now() - interval '1 day'),
  ('f0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-000000000004', '44444444-4444-4444-4444-444444444444', 'TSLA', 'short', 3, 250, now(), now() - interval '1 day'),
  ('f0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000002', 'ac000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'NVDA', 'long', 2, 900, now(), now() - interval '1 day');

insert into public.tags (id, org_id, name) values
  ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'breakout'),
  ('e0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000002', 'swing');

insert into public.trade_tags (trade_id, tag_id) values
  ('f0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000003');

-- --- Bob, a member of Desk --------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

select results_eq(
  'select id from public.trades order by id',
  $$ values ('f0000000-0000-0000-0000-000000000002'::uuid) $$,
  'invariant 1: a member sees only their own trades, not a colleague''s in the same org'
);

select results_eq(
  $$ select id from public.accounts where org_id = 'd0000000-0000-0000-0000-000000000001' $$,
  $$ values ('ac000000-0000-0000-0000-000000000002'::uuid) $$,
  'invariant 1: a member sees only their own account within the org'
);

select results_eq(
  'select trade_id from public.trade_tags order by trade_id',
  $$ values ('f0000000-0000-0000-0000-000000000002'::uuid) $$,
  'a member sees tag links only on trades they can see'
);

select is_empty(
  $$ update public.trades set thesis = 'edited by bob'
     where id = 'f0000000-0000-0000-0000-000000000004' returning id $$,
  'invariant 1: a member cannot update a colleague''s trade; it is invisible, so zero rows'
);

select is_empty(
  $$ delete from public.trades where id = 'f0000000-0000-0000-0000-000000000004' returning id $$,
  'invariant 1: a member cannot delete a colleague''s trade'
);

select lives_ok(
  $$ insert into public.trades (org_id, account_id, user_id, symbol, side, quantity, entry_price, entry_at)
     values ('d0000000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-000000000002',
             '22222222-2222-2222-2222-222222222222', 'AMD', 'long', 1, 150, now()) $$,
  'a member can log a trade into their own account'
);

select throws_ok(
  $$ insert into public.trades (org_id, account_id, user_id, symbol, side, quantity, entry_price, entry_at)
     values ('d0000000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-000000000004',
             '44444444-4444-4444-4444-444444444444', 'AMD', 'long', 1, 150, now()) $$,
  '42501',
  null,
  'a member cannot log a trade under a colleague''s name'
);

select throws_ok(
  $$ insert into public.trades (org_id, account_id, user_id, symbol, side, quantity, entry_price, entry_at)
     values ('d0000000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-000000000004',
             '22222222-2222-2222-2222-222222222222', 'AMD', 'long', 1, 150, now()) $$,
  '23503',
  null,
  'a member cannot log their own trade into a colleague''s account (composite foreign key)'
);

select throws_ok(
  $$ insert into public.trades (org_id, account_id, user_id, symbol, side, quantity, entry_price, entry_at)
     values ('d0000000-0000-0000-0000-000000000002', 'ac000000-0000-0000-0000-000000000003',
             '22222222-2222-2222-2222-222222222222', 'AMD', 'long', 1, 150, now()) $$,
  '42501',
  null,
  'invariant 3: a user cannot insert a trade into an org they do not belong to'
);

select throws_ok(
  $$ update public.trades set user_id = '44444444-4444-4444-4444-444444444444'
     where id = 'f0000000-0000-0000-0000-000000000002' $$,
  '42501',
  null,
  'the owner of a trade cannot be reassigned'
);

select throws_ok(
  $$ update public.trades set org_id = 'd0000000-0000-0000-0000-000000000002'
     where id = 'f0000000-0000-0000-0000-000000000002' $$,
  '42501',
  null,
  'a trade cannot be moved to another org'
);

select results_eq(
  $$ update public.trades set thesis = 'edited by bob'
     where id = 'f0000000-0000-0000-0000-000000000002' returning updated_at = now() $$,
  $$ values (true) $$,
  'a member can edit their own trade, and the trigger stamps updated_at'
);

select throws_ok(
  $$ insert into public.trade_tags (trade_id, tag_id)
     values ('f0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000003') $$,
  '42501',
  null,
  'a trade cannot be tagged with a tag from another org'
);

select results_eq(
  $$ select id from public.tags
     where id in ('e0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000003') $$,
  $$ values ('e0000000-0000-0000-0000-000000000001'::uuid) $$,
  'invariant 3: a member sees their own org''s tags and not another org''s'
);

select results_eq(
  $$ select id from public.profiles where id in (
       '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
       '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444')
     order by id $$,
  $$ values ('11111111-1111-1111-1111-111111111111'::uuid),
            ('22222222-2222-2222-2222-222222222222'::uuid),
            ('44444444-4444-4444-4444-444444444444'::uuid) $$,
  'invariant 3: a member sees fellow org members'' profiles, and nobody else''s'
);

select throws_ok(
  $$ insert into public.memberships (org_id, user_id, role)
     values ('d0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'owner') $$,
  '42501',
  null,
  'invariant 4: a user cannot add themselves to an organisation'
);

select throws_ok(
  $$ update public.memberships set role = 'owner'
     where user_id = '22222222-2222-2222-2222-222222222222' $$,
  '42501',
  null,
  'invariant 4: a user cannot escalate their own role'
);

select throws_ok(
  $$ insert into public.organizations (name, slug) values ('Mine', 'bobs-own') $$,
  '42501',
  null,
  'a user cannot create an organisation directly through the API'
);

select is_empty(
  $$ update public.organizations set name = 'Renamed by Bob'
     where id = 'd0000000-0000-0000-0000-000000000001' returning id $$,
  'a member cannot rename their organisation'
);

-- --- Dave, the other member of Desk -----------------------------------------------------

set local request.jwt.claims to '{"sub": "44444444-4444-4444-4444-444444444444", "role": "authenticated"}';

select results_eq(
  'select id from public.trades order by id',
  $$ values ('f0000000-0000-0000-0000-000000000004'::uuid) $$,
  'invariant 1: the second member also sees only their own trades'
);

-- --- Alice, owner of Desk ---------------------------------------------------------------

set local request.jwt.claims to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select results_eq(
  $$ select user_id from public.trades
     where org_id = 'd0000000-0000-0000-0000-000000000001' and symbol <> 'AMD'
     order by user_id $$,
  $$ values ('11111111-1111-1111-1111-111111111111'::uuid),
            ('22222222-2222-2222-2222-222222222222'::uuid),
            ('44444444-4444-4444-4444-444444444444'::uuid) $$,
  'invariant 2: an owner sees every member''s trades in their org'
);

select is_empty(
  $$ select id from public.trades where org_id = 'd0000000-0000-0000-0000-000000000002' $$,
  'invariant 2: an owner sees no trades outside their own orgs'
);

select results_eq(
  $$ select count(*) from public.accounts where org_id = 'd0000000-0000-0000-0000-000000000001' $$,
  $$ values (3::bigint) $$,
  'invariant 2: an owner sees every member''s account in their org'
);

select results_eq(
  $$ select count(*) from public.trade_tags
     where trade_id in ('f0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000004') $$,
  $$ values (2::bigint) $$,
  'an owner sees tag links on every member''s trades'
);

select is_empty(
  $$ update public.trades set thesis = 'edited by alice'
     where id = 'f0000000-0000-0000-0000-000000000002' returning id $$,
  'an owner can read a member''s trade but not edit it'
);

select is_empty(
  $$ delete from public.trades where id = 'f0000000-0000-0000-0000-000000000002' returning id $$,
  'an owner cannot delete a member''s trade'
);

select isnt_empty(
  $$ update public.organizations set name = 'Desk Renamed'
     where id = 'd0000000-0000-0000-0000-000000000001' returning id $$,
  'an owner can rename their organisation'
);

-- --- Carol, owner of a different org ----------------------------------------------------

set local request.jwt.claims to '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';

select is_empty(
  $$ select id from public.organizations where id = 'd0000000-0000-0000-0000-000000000001' $$,
  'invariant 3: an outsider cannot see the organisation'
);

select is_empty(
  $$ select user_id from public.memberships where org_id = 'd0000000-0000-0000-0000-000000000001' $$,
  'invariant 3: an outsider cannot see its memberships'
);

select is_empty(
  $$ select id from public.profiles where id in (
       '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
       '44444444-4444-4444-4444-444444444444') $$,
  'invariant 3: an outsider cannot see its members'' profiles'
);

select is_empty(
  $$ select id from public.accounts where org_id = 'd0000000-0000-0000-0000-000000000001' $$,
  'invariant 3: an outsider cannot see its accounts'
);

select is_empty(
  $$ select id from public.trades where org_id = 'd0000000-0000-0000-0000-000000000001' $$,
  'invariant 3: an outsider cannot see its trades'
);

select is_empty(
  $$ select id from public.tags where org_id = 'd0000000-0000-0000-0000-000000000001' $$,
  'invariant 3: an outsider cannot see its tags'
);

select is_empty(
  $$ select trade_id from public.trade_tags
     where trade_id in ('f0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000004') $$,
  'invariant 3: an outsider cannot see its tag links'
);

-- --- What actually happened, checked as postgres ----------------------------------------

reset role;

select results_eq(
  $$ select thesis from public.trades where id = 'f0000000-0000-0000-0000-000000000004' $$,
  $$ values (null::text) $$,
  'the colleague''s trade Bob tried to edit is untouched'
);

select * from finish();
rollback;
