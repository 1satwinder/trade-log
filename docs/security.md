# Security and authorisation

This project's headline lesson is authorisation, so this document is not boilerplate. It
states the invariants, the places they could break, and the checklist to run before
merging anything that touches data access.

## Authorisation model

Two independent questions, answered in two different places:

**Who are you?** Answered by Supabase Auth. On the server, the only trustworthy answer
comes from `serverSupabaseUser(event)`, which verifies the token. `serverSupabaseSession`
is explicitly not trustworthy, because the session originates on the client and can be
tampered with. Client-side route middleware is user experience only: it hides pages, it
never secures them.

**What may you see or change?** Answered by Postgres, through row level security. The
application does not decide this; policies do. Rules expressed only in application code
are considered undefended, because the same table can be reached through another route,
the Drizzle admin client, or a future feature.

Roles are `owner`, `admin`, `member`, held per organisation in `memberships`. A user can
belong to several organisations with different roles, so a role is never a property of the
user, only of the pair.

## Invariants

These must hold at all times. Each has a test.

1. A member can read, update and delete only their own trades.
2. An owner or admin can read every trade in their own organisations, and no trade
   outside them.
3. No user can read any row belonging to an organisation they are not a member of, for
   any table.
4. No user can escalate their own role, or add themselves to an organisation.
5. An anonymous visitor can read only what a valid, unexpired, unrevoked share link
   exposes, and never attachments.
6. `private` schema helper functions are not callable by `anon` and are not reachable via
   RPC, because the schema is not exposed.
7. Every table in `public` has RLS enabled. There are no exceptions, including lookup
   tables.

## Where this breaks in practice

**The Drizzle admin client.** It connects as a privileged role and bypasses RLS with no
error. Every query written with it must filter by `org_id` explicitly, and must never take
an identifier straight from user input without first confirming ownership through the
RLS-enforced path. This is the single most likely source of a leak in this codebase.

**Service-role routes.** Three are allowed: invitations, the Stripe webhook, and
organisation deletion. Each call site carries a comment naming why. A fourth use requires
a decision entry.

**Policy recursion and performance.** Joining `memberships` directly inside a policy
recurses into that table's own policies. Use the `security definer` helpers, and call them
as `(select private.helper(...))` so the result is cached per statement rather than
evaluated per row.

**Insert policies.** A `select` policy alone does not stop a user from inserting a row
into another organisation. Every writable table needs `with check` clauses that pin both
`org_id` and, where relevant, `user_id`.

**Shared server clients.** A Supabase client created at module scope on the server leaks
sessions between requests. Always create per request.

## Secrets

- Everything reaches the app through `runtimeConfig`. Nothing is read from
  `process.env` at call sites.
- Only keys under `runtimeConfig.public` may reach the browser. The Supabase secret key,
  Stripe secret and webhook secret, Resend key, market-data key and database URL are
  server-only, always.
- `.env` is never committed; `.env.example` lists every variable with a description and no
  value.
- Staging uses Stripe test keys; production uses live keys. They live in Render's
  environment settings, not in the repository.
- Market data is proxied through Nitro precisely so the provider key stays server-side.

## Webhooks

The Stripe endpoint reads the raw body, verifies the signature against the webhook
secret, then records the event id in `stripe_events` before doing any work. Duplicate
deliveries are ignored on conflict. Unverified requests are rejected before parsing. The
handler is written to be safe when run twice, because it will be.

## Storage

The `trade-attachments` bucket is private. Object paths begin with the organisation id so
a storage policy can enforce tenancy by prefix. All access is through short-lived signed
URLs issued after an ownership check. Public journal pages never link to attachments.

## Rate limiting and abuse

Invite creation, share-link creation, the public journal page and the quote proxy all get
simple per-identifier rate limits backed by Nitro storage. Invite tokens are stored
hashed, single-use, and expire. Share-link slugs are random rather than sequential.

## Review checklist

Run through this before merging anything that touches data access:

- [ ] Does every new route call `requireUser`, and `requireOrgRole` where an organisation
      is involved?
- [ ] Is user input validated with a schema at the boundary?
- [ ] If the service-role or Drizzle admin client is used, is there a comment justifying
      it, and does every query filter by `org_id`?
- [ ] Does every new table have RLS enabled, with `select`, `insert`, `update` and
      `delete` policies each chosen deliberately?
- [ ] Are policy predicates wrapped as `(select ...)`, scoped `to authenticated`, and
      backed by an index?
- [ ] Is there a test proving the new surface cannot be read across organisations?
- [ ] Did any new secret get added to `.env.example` and to Render, and is it server-only?
