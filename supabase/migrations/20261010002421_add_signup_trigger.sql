-- Provisions every new user in the same transaction as their signup (ADR-0009): a profile,
-- a personal organisation, an owner membership in it and a default "Main" account.
--
-- This runs inside GoTrue's insert into auth.users, so any error here rolls the signup back
-- and the user sees "Database error saving new user". Every input is therefore treated as
-- untrusted and possibly missing: phone and anonymous users have no email, and
-- raw_user_meta_data is whatever the client sent. That metadata is used for display only,
-- never for authorisation, because the user can change it.

-- Creates the four rows a user needs before the app is usable.
-- security definer: it runs as its owner, postgres, so it can insert into organizations and
-- memberships, which deliberately have no insert policy for any API role.
-- set search_path = '': every name is schema-qualified, so nothing can be shadowed.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text;
  v_base_slug text;
  v_org_id uuid;
begin
  -- 80 characters leaves room for the "'s journal" suffix inside the 100-character limit
  -- on organizations.name. An unbounded full_name must never be able to block a signup.
  v_display_name := left(
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(new.email, '@', 1), '')
    ),
    80
  );

  insert into public.profiles (id, display_name)
  values (new.id, v_display_name);

  -- Kebab-case from the email's local part, to satisfy organizations_slug_format. Trimming
  -- dashes after truncating stops a cut from leaving a trailing dash.
  v_base_slug := coalesce(
    nullif(
      btrim(
        left(regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9]+', '-', 'g'), 30),
        '-'
      ),
      ''
    ),
    'user'
  );

  -- The random suffix keeps slugs from revealing which names are taken. on conflict do
  -- nothing returns no row on a collision, so the loop retries without catching an
  -- exception, which in PL/pgSQL would cost a savepoint per attempt.
  for attempt in 1..5 loop
    insert into public.organizations (name, slug)
    values (
      case
        when v_display_name is null then 'My journal'
        else v_display_name || '''s journal'
      end,
      v_base_slug || '-' || left(replace(gen_random_uuid()::text, '-', ''), 6)
    )
    on conflict (slug) do nothing
    returning id into v_org_id;

    exit when v_org_id is not null;
  end loop;

  if v_org_id is null then
    raise exception 'could not allocate a unique organisation slug for user %', new.id;
  end if;

  insert into public.memberships (org_id, user_id, role)
  values (v_org_id, new.id, 'owner');

  insert into public.accounts (org_id, user_id, name)
  values (v_org_id, new.id, 'Main');

  return new;
end;
$$;

-- Trigger functions are never called directly, and execute is not checked when a trigger
-- fires, so no role needs it. Revoking from public matters because anon and authenticated
-- inherit public's default execute grant.
revoke execute on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();
