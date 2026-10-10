-- Local demo data, loaded by `supabase db reset` after the migrations. Staging and
-- production are never seeded; they are verified with real signups instead.
--
-- Cast: Maya Chen owns the "Demo Desk" organisation, and Sam Okafor and Priya Nair are
-- members of it. All three sign in with the password "demo-password", or by magic link
-- through Mailpit.
--
-- Inserting into auth.users fires the signup trigger, so each user arrives with a personal
-- organisation and a "Main" account. Maya's personal organisation becomes the Demo Desk.
-- Sam and Priya keep theirs, empty, and join the desk as members, so the demo shows both
-- a member's view and an owner's view of the same organisation.

-- --- Users ------------------------------------------------------------------------------

-- Fixed ids keep the demo logins and any hand-written checks stable across resets. GoTrue
-- reads the token columns into non-nullable strings, so they must be '' rather than null,
-- or password login fails for these users.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('demo-password', extensions.gen_salt('bf')), now(),
  '{"provider": "email", "providers": ["email"]}', jsonb_build_object('full_name', u.full_name),
  now(), now(),
  '', '', '', ''
from (values
  ('5eed0000-0000-0000-0000-000000000001'::uuid, 'maya@tradelog.test', 'Maya Chen'),
  ('5eed0000-0000-0000-0000-000000000002'::uuid, 'sam@tradelog.test', 'Sam Okafor'),
  ('5eed0000-0000-0000-0000-000000000003'::uuid, 'priya@tradelog.test', 'Priya Nair')
) as u(id, email, full_name);

-- Email login looks the user up through their email identity, not through auth.users.
insert into auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
select
  u.id::text, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users u
where u.id::text like '5eed0000-%';

-- --- The Demo Desk ----------------------------------------------------------------------

update public.organizations o
set name = 'Demo Desk', slug = 'demo-desk'
from public.memberships m
where m.org_id = o.id
  and m.user_id = '5eed0000-0000-0000-0000-000000000001';

insert into public.memberships (org_id, user_id, role)
select o.id, u.user_id, 'member'
from public.organizations o
cross join (values
  ('5eed0000-0000-0000-0000-000000000002'::uuid),
  ('5eed0000-0000-0000-0000-000000000003'::uuid)
) as u(user_id)
where o.slug = 'demo-desk';

-- Maya's desk account is the trigger's "Main". The members already have a "Main" in their
-- personal organisations, so their desk accounts are named "Desk" to tell them apart.
update public.accounts a
set starting_balance = 25000
from public.organizations o
where o.id = a.org_id and o.slug = 'demo-desk';

insert into public.accounts (org_id, user_id, name, starting_balance)
select m.org_id, m.user_id, 'Desk', 10000
from public.memberships m
join public.organizations o on o.id = m.org_id
where o.slug = 'demo-desk' and m.role = 'member';

insert into public.tags (org_id, name, color)
select o.id, t.name, t.color
from public.organizations o
cross join (values
  ('breakout', '#16a34a'),
  ('pullback', '#2563eb'),
  ('earnings', '#9333ea'),
  ('reversal', '#ea580c'),
  ('fomo', '#dc2626')
) as t(name, color)
where o.slug = 'demo-desk';

-- --- Trades -----------------------------------------------------------------------------

-- A fixed seed makes every reset produce the same trades, so a number seen in the UI today
-- is the same number tomorrow.
select setseed(0.42);

-- Each trader has a different trade count and win rate, so the owner's view of the desk
-- has a story. Every trade is drawn in R: the risk is 2-5% of the entry price, winners
-- exit at +0.8R to +3R and losers at -0.4R to -1R. About one in ten trades has no stop,
-- and each trader's two most recent trades are still open.
with traders as (
  select a.id as account_id, a.org_id, a.user_id, t.trade_count, t.win_rate
  from (values
    ('5eed0000-0000-0000-0000-000000000001'::uuid, 16, 0.60),
    ('5eed0000-0000-0000-0000-000000000002'::uuid, 14, 0.40),
    ('5eed0000-0000-0000-0000-000000000003'::uuid, 14, 0.55)
  ) as t(user_id, trade_count, win_rate)
  join public.accounts a on a.user_id = t.user_id
  join public.organizations o on o.id = a.org_id and o.slug = 'demo-desk'
),
draws as (
  select
    tr.org_id,
    tr.account_id,
    tr.user_id,
    (array['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'SPY', 'QQQ', 'AMD', 'GOOGL'])
      [1 + floor(random() * 10)::int] as symbol,
    (case when random() < 0.7 then 'long' else 'short' end)::public.trade_side as side,
    round((40 + random() * 460)::numeric, 2) as entry_price,
    (0.02 + random() * 0.03)::numeric as risk_fraction,
    random() >= 0.1 as has_stop,
    (case
      when random() < tr.win_rate then 0.8 + random() * 2.2
      else -(0.4 + random() * 0.6)
    end)::numeric as r_outcome,
    date_trunc('day', now()) - interval '1 day'
      - make_interval(days => (tr.trade_count - g.n) * 12 + floor(random() * 5)::int)
      + make_interval(hours => 14, mins => floor(random() * 300)::int) as entry_at,
    make_interval(mins => 30 + floor(random() * 7200)::int) as holding_time,
    round((1 + random() * 4)::numeric, 2) as fees,
    g.n > tr.trade_count - 2 as is_open,
    (array[
      'Clean break of the morning range on volume',
      'Pullback to the 20-day moving average',
      'Fading an overextended gap',
      'Earnings drift continuation',
      null,
      null
    ])[1 + floor(random() * 6)::int] as thesis
  from traders tr
  cross join lateral generate_series(1, tr.trade_count) as g(n)
)
insert into public.trades (
  org_id, account_id, user_id, symbol, side, quantity, entry_price, exit_price,
  stop_price, entry_at, exit_at, fees, status, thesis
)
select
  d.org_id,
  d.account_id,
  d.user_id,
  d.symbol,
  d.side,
  greatest(1, floor(4000 / d.entry_price)),
  d.entry_price,
  case when not d.is_open
    then round(d.entry_price + s.direction * d.r_outcome * d.entry_price * d.risk_fraction, 2)
  end,
  case when d.has_stop
    then round(d.entry_price - s.direction * d.entry_price * d.risk_fraction, 2)
  end,
  d.entry_at,
  case when not d.is_open then d.entry_at + d.holding_time end,
  d.fees,
  (case when d.is_open then 'open' else 'closed' end)::public.trade_status,
  d.thesis
from draws d
cross join lateral (
  select case d.side when 'long' then 1 else -1 end as direction
) as s;

-- Every desk trade gets one setup tag, cycling through them in date order.
insert into public.trade_tags (trade_id, tag_id)
select t.id, g.id
from (
  select t.id, t.org_id, row_number() over (order by t.entry_at) as rn
  from public.trades t
  join public.organizations o on o.id = t.org_id and o.slug = 'demo-desk'
) as t
join public.tags g
  on g.org_id = t.org_id
  and g.name = (array['breakout', 'pullback', 'earnings', 'reversal'])[1 + (t.rn % 4)::int];

-- About half the losing trades are also tagged as impulsive entries.
insert into public.trade_tags (trade_id, tag_id)
select t.id, g.id
from public.trades t
join public.organizations o on o.id = t.org_id and o.slug = 'demo-desk'
join public.tags g on g.org_id = t.org_id and g.name = 'fomo'
where t.status = 'closed'
  and (t.exit_price - t.entry_price) * (case t.side when 'long' then 1 else -1 end) < 0
  and random() < 0.5;
