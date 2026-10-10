-- The signup trigger from ADR-0009: one signup creates exactly one profile, one personal
-- organisation, one owner membership and one account, and no input GoTrue can hand it
-- blocks the signup.
--
-- Cast: Erin signs up with a full name, Frank with only an awkward email, Hana by phone
-- with no email at all, Ivan with an absurdly long name, and two Ginas share a local part.
-- Inserting into auth.users as postgres fires the trigger exactly as GoTrue's insert does.

begin;
create extension if not exists pgtap with schema extensions;

select plan(18);

select has_trigger(
  'auth', 'users', 'on_auth_user_created',
  'signups on auth.users fire the provisioning trigger'
);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-0000-0000-000000000001', 'erin@test.local', '{"full_name": "  Erin Example  "}'),
  ('a1000000-0000-0000-0000-000000000002', 'Frank.O+Trades@test.local', null),
  ('a1000000-0000-0000-0000-000000000005', 'gina@one.test', '{}'),
  ('a1000000-0000-0000-0000-000000000006', 'gina@two.test', '{}');

-- --- Erin: the ordinary case ------------------------------------------------------------

select results_eq(
  $$ select display_name from public.profiles where id = 'a1000000-0000-0000-0000-000000000001' $$,
  $$ values ('Erin Example') $$,
  'a signup creates exactly one profile, named from the signup metadata'
);

select results_eq(
  $$ select role::text from public.memberships where user_id = 'a1000000-0000-0000-0000-000000000001' $$,
  $$ values ('owner') $$,
  'a signup creates exactly one membership, as owner'
);

select results_eq(
  $$ select o.name from public.organizations o
     join public.memberships m on m.org_id = o.id
     where m.user_id = 'a1000000-0000-0000-0000-000000000001' $$,
  $$ values ('Erin Example''s journal') $$,
  'the personal organisation is named after the user'
);

select ok(
  (select o.slug ~ '^erin-[0-9a-f]{6}$' from public.organizations o
   join public.memberships m on m.org_id = o.id
   where m.user_id = 'a1000000-0000-0000-0000-000000000001'),
  'the slug is the email local part plus a random suffix'
);

select results_eq(
  $$ select a.name, a.org_id = m.org_id from public.accounts a
     join public.memberships m on m.user_id = a.user_id
     where a.user_id = 'a1000000-0000-0000-0000-000000000001' $$,
  $$ values ('Main', true) $$,
  'a signup creates exactly one account, in the personal organisation'
);

-- --- Frank: no metadata and an email that is not slug-safe -----------------------------

select results_eq(
  $$ select display_name from public.profiles where id = 'a1000000-0000-0000-0000-000000000002' $$,
  $$ values ('Frank.O+Trades') $$,
  'without a full name, the display name falls back to the email local part'
);

select ok(
  (select o.slug ~ '^frank-o-trades-[0-9a-f]{6}$' from public.organizations o
   join public.memberships m on m.org_id = o.id
   where m.user_id = 'a1000000-0000-0000-0000-000000000002'),
  'an email with dots, plus signs and capitals still yields a valid slug'
);

-- --- Hana: a phone signup with no email ------------------------------------------------

select lives_ok(
  $$ insert into auth.users (id, phone) values ('a1000000-0000-0000-0000-000000000003', '15550001234') $$,
  'a signup with no email succeeds'
);

select results_eq(
  $$ select p.display_name, o.name, o.slug ~ '^user-[0-9a-f]{6}$'
     from public.profiles p
     join public.memberships m on m.user_id = p.id
     join public.organizations o on o.id = m.org_id
     where p.id = 'a1000000-0000-0000-0000-000000000003' $$,
  $$ values (null::text, 'My journal', true) $$,
  'a user with no email gets a generic organisation name and slug'
);

-- --- Ivan: a name longer than any column allows ----------------------------------------

select lives_ok(
  $$ insert into auth.users (id, email, raw_user_meta_data)
     values ('a1000000-0000-0000-0000-000000000004', 'ivan@test.local',
             jsonb_build_object('full_name', repeat('Ivan ', 60))) $$,
  'a signup with a 300-character name succeeds'
);

select ok(
  (select char_length(o.name) <= 100 from public.organizations o
   join public.memberships m on m.org_id = o.id
   where m.user_id = 'a1000000-0000-0000-0000-000000000004'),
  'a long name is truncated to fit the organisation name limit'
);

-- --- The two Ginas ----------------------------------------------------------------------

select results_eq(
  $$ select count(distinct o.slug) from public.organizations o
     join public.memberships m on m.org_id = o.id
     where m.user_id in ('a1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000006') $$,
  $$ values (2::bigint) $$,
  'two users with the same email local part get different slugs'
);

-- --- Erin, signed in: the rows are usable through RLS ----------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub": "a1000000-0000-0000-0000-000000000001", "role": "authenticated"}';

select results_eq(
  'select name from public.organizations',
  $$ values ('Erin Example''s journal') $$,
  'a new user sees their personal organisation and nothing else'
);

select results_eq(
  'select name from public.accounts',
  $$ values ('Main') $$,
  'a new user sees their default account'
);

select isnt_empty(
  $$ insert into public.trades (org_id, account_id, user_id, symbol, side, quantity, entry_price, entry_at)
     select a.org_id, a.id, a.user_id, 'AAPL', 'long', 1, 190, now() from public.accounts a
     returning id $$,
  'a new user can log a trade into the default account straight away'
);

select throws_ok(
  $$ select private.handle_new_user() $$,
  '42501',
  null,
  'a signed-in user cannot invoke provisioning directly'
);

reset role;

select ok(
  not has_function_privilege('authenticated', 'private.handle_new_user()', 'execute'),
  'authenticated holds no execute grant on the provisioning function'
);

select * from finish();
rollback;
