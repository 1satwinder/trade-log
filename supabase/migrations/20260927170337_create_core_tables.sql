-- Core domain tables, with their grants, row level security and policies.
--
-- Part 1 is drizzle-kit output from server/db/schema.ts, with keywords lowercased and
-- identifiers unquoted to match the rest of the migrations. Part 2 is hand-written, because
-- drizzle-kit does not generate it. Both live in one file so that no table ever exists
-- without its policies, even between two migrations.

-- ===========================================================================================
-- Part 1: tables (generated)
-- ===========================================================================================

create type public.org_role as enum('owner', 'admin', 'member');
create type public.trade_side as enum('long', 'short');
create type public.trade_status as enum('open', 'closed');

create table accounts (
  id uuid primary key default gen_random_uuid() not null,
  org_id uuid not null,
  user_id uuid not null,
  name text not null,
  currency text default 'USD' not null,
  starting_balance numeric(16, 2) default '0' not null,
  created_at timestamp with time zone default now() not null,
  constraint accounts_org_id_user_id_name_key unique(org_id, user_id, name),
  constraint accounts_id_org_id_user_id_key unique(id, org_id, user_id),
  constraint accounts_name_length check (char_length(accounts.name) between 1 and 100),
  constraint accounts_currency_format check (accounts.currency ~ '^[A-Z]{3}$'),
  constraint accounts_starting_balance_non_negative check (accounts.starting_balance >= 0)
);

create table memberships (
  org_id uuid not null,
  user_id uuid not null,
  role org_role default 'member' not null,
  created_at timestamp with time zone default now() not null,
  constraint memberships_org_id_user_id_pk primary key(org_id, user_id)
);

create table organizations (
  id uuid primary key default gen_random_uuid() not null,
  name text not null,
  slug text not null,
  created_at timestamp with time zone default now() not null,
  constraint organizations_slug_unique unique(slug),
  constraint organizations_slug_format check (organizations.slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint organizations_name_length check (char_length(organizations.name) between 1 and 100)
);

create table profiles (
  id uuid primary key not null,
  display_name text,
  avatar_url text,
  created_at timestamp with time zone default now() not null
);

create table tags (
  id uuid primary key default gen_random_uuid() not null,
  org_id uuid not null,
  name text not null,
  color text,
  created_at timestamp with time zone default now() not null,
  constraint tags_org_id_name_key unique(org_id, name),
  constraint tags_name_length check (char_length(tags.name) between 1 and 40),
  constraint tags_color_format check (tags.color is null or tags.color ~ '^#[0-9a-f]{6}$')
);

create table trade_tags (
  trade_id uuid not null,
  tag_id uuid not null,
  constraint trade_tags_trade_id_tag_id_pk primary key(trade_id, tag_id)
);

create table trades (
  id uuid primary key default gen_random_uuid() not null,
  org_id uuid not null,
  account_id uuid not null,
  user_id uuid not null,
  symbol text not null,
  side trade_side not null,
  quantity numeric(20, 8) not null,
  entry_price numeric(20, 8) not null,
  exit_price numeric(20, 8),
  stop_price numeric(20, 8),
  entry_at timestamp with time zone not null,
  exit_at timestamp with time zone,
  fees numeric(16, 2) default '0' not null,
  status trade_status default 'open' not null,
  thesis text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint trades_symbol_length check (char_length(trades.symbol) between 1 and 20),
  constraint trades_quantity_positive check (trades.quantity > 0),
  constraint trades_entry_price_positive check (trades.entry_price > 0),
  constraint trades_exit_price_positive check (trades.exit_price is null or trades.exit_price > 0),
  constraint trades_stop_price_positive check (trades.stop_price is null or trades.stop_price > 0),
  constraint trades_fees_non_negative check (trades.fees >= 0),
  constraint trades_exit_matches_status check ((trades.status = 'open' and trades.exit_price is null and trades.exit_at is null)
        or (trades.status = 'closed' and trades.exit_price is not null and trades.exit_at is not null)),
  constraint trades_exit_after_entry check (trades.exit_at is null or trades.exit_at >= trades.entry_at)
);

alter table accounts add constraint accounts_org_id_organizations_id_fk foreign key (org_id) references public.organizations(id) on delete cascade on update no action;
alter table accounts add constraint accounts_user_id_users_id_fk foreign key (user_id) references auth.users(id) on delete cascade on update no action;
alter table memberships add constraint memberships_org_id_organizations_id_fk foreign key (org_id) references public.organizations(id) on delete cascade on update no action;
alter table memberships add constraint memberships_user_id_users_id_fk foreign key (user_id) references auth.users(id) on delete cascade on update no action;
alter table profiles add constraint profiles_id_users_id_fk foreign key (id) references auth.users(id) on delete cascade on update no action;
alter table tags add constraint tags_org_id_organizations_id_fk foreign key (org_id) references public.organizations(id) on delete cascade on update no action;
alter table trade_tags add constraint trade_tags_trade_id_trades_id_fk foreign key (trade_id) references public.trades(id) on delete cascade on update no action;
alter table trade_tags add constraint trade_tags_tag_id_tags_id_fk foreign key (tag_id) references public.tags(id) on delete cascade on update no action;
alter table trades add constraint trades_account_fkey foreign key (account_id, org_id, user_id) references public.accounts(id, org_id, user_id) on delete cascade on update no action;

create index accounts_user_id_idx on accounts using btree (user_id);
create index memberships_user_id_org_id_idx on memberships using btree (user_id, org_id);
create index trade_tags_tag_id_idx on trade_tags using btree (tag_id);
create index trades_org_id_user_id_idx on trades using btree (org_id, user_id);
create index trades_org_id_entry_at_idx on trades using btree (org_id, entry_at desc nulls last);
create index trades_account_id_idx on trades using btree (account_id);

-- ===========================================================================================
-- Part 2: authorisation (hand-written)
-- ===========================================================================================

-- The private schema is not in the API's exposed schemas, so nothing in it is reachable
-- over PostgREST as an RPC. No role but postgres is granted usage on it.
create schema private;

-- --- Helper functions ------------------------------------------------------------------
--
-- security definer: they read memberships as their owner, bypassing its RLS. Without that,
-- a policy on memberships that asks "which orgs am I in?" would query memberships again
-- and recurse.
-- set search_path = '': every name inside is schema-qualified, so a caller cannot shadow
-- public.memberships with an object of their own.
-- No arguments: policies call them as (select private.fn()), which Postgres evaluates once
-- per statement as an InitPlan instead of once per row.

-- Every organisation the calling user belongs to, in any role.
create function private.my_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.org_id
  from public.memberships m
  where m.user_id = (select auth.uid());
$$;

-- The organisations in which the calling user is an owner or admin, and so sees every
-- member's rows rather than only their own.
create function private.my_managed_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.org_id
  from public.memberships m
  where m.user_id = (select auth.uid())
    and m.role in ('owner', 'admin');
$$;

-- Keeps updated_at honest without trusting the client or the ORM to set it.
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Postgres grants execute on every new function to PUBLIC, which anon inherits. Revoking
-- from anon alone would leave that inherited grant in place.
revoke execute on function private.my_org_ids() from public, anon;
revoke execute on function private.my_managed_org_ids() from public, anon;
revoke execute on function private.set_updated_at() from public, anon, authenticated;
-- Policy expressions run as the calling role, so authenticated must be able to execute the
-- helpers it relies on.
grant execute on function private.my_org_ids() to authenticated;
grant execute on function private.my_managed_org_ids() to authenticated;

create trigger trades_set_updated_at
before update on public.trades
for each row execute function private.set_updated_at();

-- --- Grants ----------------------------------------------------------------------------
--
-- Grants decide whether a role may touch a table at all; policies then decide which rows.
-- Everything is revoked first because the remaining default privileges still include
-- truncate, which row level security does not apply to. anon gets nothing in Phase 1.
-- Column-level update grants keep ownership and bookkeeping columns immutable from the API
-- regardless of what a policy allows.

revoke all on table
  public.profiles, public.organizations, public.memberships, public.accounts,
  public.trades, public.tags, public.trade_tags
from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name, avatar_url) on table public.profiles to authenticated;

grant select on table public.organizations to authenticated;
grant update (name) on table public.organizations to authenticated;

grant select on table public.memberships to authenticated;

grant select, insert, delete on table public.accounts to authenticated;
grant update (name, currency, starting_balance) on table public.accounts to authenticated;

grant select, insert, delete on table public.trades to authenticated;
grant update (
  account_id, symbol, side, quantity, entry_price, exit_price, stop_price,
  entry_at, exit_at, fees, status, thesis
) on table public.trades to authenticated;

grant select, insert, delete on table public.tags to authenticated;
grant update (name, color) on table public.tags to authenticated;

grant select, insert, delete on table public.trade_tags to authenticated;

-- The service role bypasses RLS; it is confined to the three call sites named in
-- docs/architecture.md.
grant select, insert, update, delete on table
  public.profiles, public.organizations, public.memberships, public.accounts,
  public.trades, public.tags, public.trade_tags
to service_role;

-- --- Row level security ----------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.accounts enable row level security;
alter table public.trades enable row level security;
alter table public.tags enable row level security;
alter table public.trade_tags enable row level security;

-- profiles: inserted by the signup trigger and deleted by cascade from auth.users, so
-- there are no insert or delete policies.

create policy "profiles: read self and fellow org members"
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or id in (
    select m.user_id
    from public.memberships m
    where m.org_id in (select private.my_org_ids())
  )
);

create policy "profiles: update self"
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- organizations: created by the signup trigger now and by a server route in Phase 2;
-- deletion is a service-role operation. No insert or delete policies.

create policy "organizations: read if member"
on public.organizations for select to authenticated
using (id in (select private.my_org_ids()));

create policy "organizations: update if owner or admin"
on public.organizations for update to authenticated
using (id in (select private.my_managed_org_ids()))
with check (id in (select private.my_managed_org_ids()));

-- memberships: readable within your own orgs. No write policies at all, so no user can add
-- themselves to an org or change their own role; writes happen only in the signup trigger
-- and, from Phase 2, the service-role invitation flow.

create policy "memberships: read within own orgs"
on public.memberships for select to authenticated
using (org_id in (select private.my_org_ids()));

-- accounts and trades share one visibility rule: members see their own rows, owners and
-- admins see every row in the orgs they manage. Writes are always your own rows only, and
-- with check pins org_id and user_id so a row cannot be written into, or moved to, someone
-- else's org or name.

create policy "accounts: read own, or all if manager"
on public.accounts for select to authenticated
using (
  org_id in (select private.my_org_ids())
  and (
    user_id = (select auth.uid())
    or org_id in (select private.my_managed_org_ids())
  )
);

create policy "accounts: insert own into own org"
on public.accounts for insert to authenticated
with check (
  org_id in (select private.my_org_ids())
  and user_id = (select auth.uid())
);

create policy "accounts: update own"
on public.accounts for update to authenticated
using (
  org_id in (select private.my_org_ids())
  and user_id = (select auth.uid())
)
with check (
  org_id in (select private.my_org_ids())
  and user_id = (select auth.uid())
);

create policy "accounts: delete own"
on public.accounts for delete to authenticated
using (
  org_id in (select private.my_org_ids())
  and user_id = (select auth.uid())
);

create policy "trades: read own, or all if manager"
on public.trades for select to authenticated
using (
  org_id in (select private.my_org_ids())
  and (
    user_id = (select auth.uid())
    or org_id in (select private.my_managed_org_ids())
  )
);

-- trades_account_fkey already forces the account to share this org and owner, so pinning
-- org_id and user_id here also pins the account to one of your own.
create policy "trades: insert own into own org"
on public.trades for insert to authenticated
with check (
  org_id in (select private.my_org_ids())
  and user_id = (select auth.uid())
);

create policy "trades: update own"
on public.trades for update to authenticated
using (
  org_id in (select private.my_org_ids())
  and user_id = (select auth.uid())
)
with check (
  org_id in (select private.my_org_ids())
  and user_id = (select auth.uid())
);

create policy "trades: delete own"
on public.trades for delete to authenticated
using (
  org_id in (select private.my_org_ids())
  and user_id = (select auth.uid())
);

-- tags: shared vocabulary within an org, so any member may read and write them.

create policy "tags: read within own orgs"
on public.tags for select to authenticated
using (org_id in (select private.my_org_ids()));

create policy "tags: insert into own orgs"
on public.tags for insert to authenticated
with check (org_id in (select private.my_org_ids()));

create policy "tags: update within own orgs"
on public.tags for update to authenticated
using (org_id in (select private.my_org_ids()))
with check (org_id in (select private.my_org_ids()));

create policy "tags: delete within own orgs"
on public.tags for delete to authenticated
using (org_id in (select private.my_org_ids()));

-- trade_tags: a link is visible exactly when its trade is. The subquery on trades runs
-- under trades' own policies, so this mirrors that rule instead of restating it. Only the
-- trade's owner may tag it, and only with a tag from the trade's org. No update policy:
-- a link is changed by deleting it and inserting another.

create policy "trade_tags: read if trade visible"
on public.trade_tags for select to authenticated
using (
  exists (select 1 from public.trades t where t.id = trade_tags.trade_id)
);

create policy "trade_tags: insert on own trade with same-org tag"
on public.trade_tags for insert to authenticated
with check (
  exists (
    select 1
    from public.trades t
    join public.tags g on g.org_id = t.org_id
    where t.id = trade_tags.trade_id
      and g.id = trade_tags.tag_id
      and t.user_id = (select auth.uid())
  )
);

create policy "trade_tags: delete on own trade"
on public.trade_tags for delete to authenticated
using (
  exists (
    select 1
    from public.trades t
    where t.id = trade_tags.trade_id
      and t.user_id = (select auth.uid())
  )
);
