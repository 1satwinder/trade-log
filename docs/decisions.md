# Decision log

One entry per decision that had a real alternative. Each records the context, the choice,
what was rejected and why, and the consequence to live with. New decisions get appended
with the next number and the date they were made, not the date they were written up.

Format: context, decision, rejected alternatives, consequences.

---

## ADR-0001 — Build a multi-tenant trade journal

**Date**: 2026-08-30 · **Status**: accepted

**Context.** The goal is to demonstrate full-stack ownership, not frontend depth, which
an existing trading dashboard already shows. The project must be small enough to finish
and complete enough to hit every concept on the learning list.

**Decision.** Build a team trade journal: organisations, members, accounts, trades, with
members seeing only their own trades and managers seeing the whole organisation.

**Rejected.** A client portal for advisors and coaches, which has the highest freelance
transferability but a fiddlier role model and more scope creep risk. A deliberately
boring generic SaaS such as invoicing or bookings, which would be the most reusable
skeleton but throws away the fintech domain advantage and is far less memorable in an
interview.

**Consequences.** The authorisation problem is genuinely interesting, which is the point.
The domain requires a little explanation to non-trading audiences, so the demo script and
the public page must carry their weight.

---

## ADR-0002 — Target Nuxt 4, write Nitro-3-friendly code

**Date**: 2026-08-30 · **Status**: accepted

**Context.** Nuxt 4.5.x is current. Nuxt 3 reached end of life on 31 July 2026. Nuxt 5,
carrying Nitro 3 on srvx and h3 v2, is in development with no release date.

**Decision.** Build on Nuxt 4.5.x. Avoid the three things that break in Nitro 3: direct
`event.node.*` access, scattered `createError` calls with the old property names, and
direct `nitropack` imports.

**Rejected.** Waiting for Nuxt 5, which would stall the project indefinitely. Opting into
`future.compatibilityVersion: 5` now, which invites module incompatibilities in a project
whose purpose is learning fundamentals rather than debugging pre-release plumbing.

**Consequences.** A migration will be needed eventually, but it should be a small,
contained one — and writing up that migration would itself make a good portfolio artifact.

---

## ADR-0003 — Managed Supabase, with the local CLI stack for schema work and CI

**Date**: 2026-08-30 · **Status**: accepted

**Context.** Managed Supabase is the fastest way to start. But policies will be rewritten
many times, CI needs a disposable database, and dashboard-authored schema changes leave
nothing in git.

**Decision.** Managed projects for staging and production from day one. The local Docker
stack for schema and policy iteration and for CI. No schema change is ever made in the
dashboard.

**Rejected.** Managed-only, which makes the RLS iteration loop slow and encourages
undocumented schema drift. Local-only, which hides the real problems: auth redirect URLs,
email deliverability, deployment.

**Consequences.** Docker in WSL2 costs a couple of gigabytes of memory. Local email goes
to a local inbox rather than a real provider, so email templates need a staging check
before release.

---

## ADR-0004 — Drizzle defines the schema; `supabase-js` serves user queries

**Date**: 2026-08-30 · **Status**: accepted

**Context.** An ORM connects over the Postgres wire protocol as a privileged role and
therefore bypasses row level security silently — no error is raised, rows simply leak.
Drizzle can respect RLS, but only if every user-facing query runs inside a transaction
that sets `request.jwt.claims`, issues `set local role authenticated`, and resets both in
a `finally` block. Missing the wrapper once is a cross-tenant data leak with no symptom.
Meanwhile `supabase-js` goes through PostgREST carrying the user's JWT, so policies apply
by construction.

**Decision.** Drizzle owns table definitions, DDL generation and TypeScript types.
User-facing reads and writes go through `serverSupabaseClient`. A Drizzle admin client is
used only for aggregates, scheduled tasks and reporting, where bypassing RLS is
intentional and every query filters by `org_id` explicitly.

**Rejected.** No ORM at all with `supabase gen types` for types, which has the fewest
moving parts but gives up schema-as-code. All-Drizzle with the `.rls()` transaction
wrapper, which teaches the ORM-plus-RLS pattern most deeply but makes a silent security
failure one forgotten wrapper away — the wrong trade in a project whose headline lesson
is authorisation.

**Consequences.** Two access paths must be kept straight, which is why the rule is stated
in [architecture.md](architecture.md) and enforced by the review checklist in
[security.md](security.md). Generated DDL must be renamed into Supabase's timestamp
convention because Drizzle's `0000_*` naming would reorder migration history.

---

## ADR-0005 — Use `@nuxtjs/supabase`, behind our own wrappers

**Date**: 2026-08-30 · **Status**: accepted

**Context.** `@nuxtjs/supabase` is not an alternative to `supabase-js`; it wraps it,
along with `@supabase/ssr`. What it actually provides is cookie-based session sharing
between server and client, the `serverSupabaseClient` / `serverSupabaseUser` /
`serverSupabaseServiceRole` helpers, a reactive `useSupabaseUser()`, and redirect guards.
Doing it by hand means roughly 100 to 150 lines: cookie adapters bound to the H3 event, a
browser-client plugin, a per-request server client, token refresh and route guards. It is
also community-maintained, so it may lag when Nuxt 5 lands.

**Decision.** Use the module. Keep every call behind `server/utils/require-user.ts` and a
`useAuth()` composable so it can be swapped for raw `@supabase/ssr` without touching
route handlers. Read the module's server services during Phase 1 and write up the
mechanism in [learning-log.md](learning-log.md).

**Rejected.** Hand-rolling SSR auth from `@supabase/ssr` immediately, which teaches more
but risks subtle session bugs early, when the schema and policies deserve the attention.

**Consequences.** A dependency sits on the critical path for auth. The wrapper layer plus
the write-up is the mitigation, and it means the mechanism can still be explained from
first principles in an interview.

---

## ADR-0006 — Deploy to Render with the `node-server` preset in Docker

**Date**: 2026-08-30 · **Status**: accepted

**Context.** Nitro's scheduled tasks have per-platform support: in-process via croner on
`node-server`, native cron on Vercel and Cloudflare, and workaround-only on Netlify.
Existing Docker, Nginx and Kubernetes experience is an asset that a zero-config platform
would waste.

**Decision.** Render, running the Nitro `node-server` preset from our own Dockerfile. A
persistent process means the scheduled task runs in-process with identical behaviour
locally and in production, and the session-mode database connection needs no pooler
workarounds.

**Rejected.** Vercel, which is the most convenient and has native cron, but hides the
infrastructure and adds transaction-pooler friction for direct Postgres access. Netlify,
which cannot do scheduled tasks through the Nitro API. A bare VPS with Docker Compose,
which teaches the most infrastructure but adds TLS, reverse proxy, backup and monitoring
work that competes with the actual learning goals. AWS on ECS Fargate, which carries the
most resume weight but where IAM, VPC and load balancer setup could consume weeks.

**Consequences.** `swr` caching is per-instance on this preset, so a second instance
would require Nitro cache storage on Redis. Deploying the same image to AWS later is a
contained follow-up, deliberately deferred.

---

## ADR-0007 — Tailwind plus Nuxt UI rather than a hand-built SCSS system

**Date**: 2026-08-30 · **Status**: accepted

**Context.** Existing strength is SCSS and component architecture. That strength is
already demonstrated elsewhere, and this project's budget should go to the server side.

**Decision.** Tailwind with Nuxt UI components.

**Rejected.** A hand-rolled SCSS design system, which would be enjoyable and produce a
nicer result but consumes weeks teaching nothing new.

**Consequences.** The UI will look like a competent modern SaaS rather than something
distinctive. Acceptable, given the project's story is backend ownership.

---

## ADR-0008 — A minimal organisation model lands in Phase 1

**Date**: 2026-09-27 · **Status**: accepted

**Context.** The roadmap put `organizations` and `memberships` in Phase 2, but Phase 1
already needs them: every child table carries `org_id`, every policy resolves tenancy
through `private.my_org_ids()`, which reads `memberships`, and Phase 1 itself asks for a
personal organisation on signup.

**Decision.** Phase 1 creates `organizations(id, name, slug, created_at)`, `memberships`
and the `org_role` enum, with their policies. Phase 2 keeps everything that makes an
organisation shared: invitations, `/app/[org]` routing, the switcher and the team page.
Billing columns arrive in Phase 4 as their own `alter table` migration.

**Rejected.** User-scoped tables in Phase 1 with tenancy added in Phase 2, which means
rewriting every policy and backfilling `org_id` into live data — the retrofit the
denormalised design exists to avoid. Pulling the whole Phase 2 schema forward, which
drags invitations and their service-role path in before the basics are understood.

**Consequences.** Phase 1 policies are the real multi-tenant policies from day one, and
seeded memberships let Phase 1 tests exercise member-versus-manager visibility even
though the invite flow does not exist yet.

---

## ADR-0009 — A trigger on `auth.users` provisions each new user

**Date**: 2026-09-27 · **Status**: accepted

**Context.** Each new user needs a profile, a personal organisation, an owner membership
and a default account before the app is usable.

**Decision.** One `security definer` trigger function in the `private` schema runs after
insert on `auth.users` and creates all four rows in the same transaction as the signup.

**Rejected.** A Nitro route called on first login, which can be skipped by a client that
never calls it, can race when two tabs log in at once, and leaves a user half provisioned
if it fails midway. It would also need the service-role client, a fourth bypass site.

**Consequences.** A bug in the trigger makes every signup fail with "Database error saving
new user", so the trigger has its own test. Provisioning logic lives in SQL rather than
TypeScript, which is less familiar but cannot be bypassed.

---

## ADR-0010 — RLS tests are SQL, written with pgTAP

**Date**: 2026-09-27 · **Status**: accepted

**Context.** The headline invariant — member A cannot read member B's trades — needs an
automated test that fails when a policy is loosened.

**Decision.** pgTAP tests in `supabase/tests/`, run by `supabase test db`. Each test
impersonates users with `set local role authenticated` and `request.jwt.claims`, which is
exactly what PostgREST does per request, and rolls back at the end. The community
`basejump-supabase_test_helpers` package is not used; the two impersonation lines are the
concept being learned.

**Rejected.** Vitest driving several signed-in `supabase-js` clients against the running
stack, which tests the full HTTP path but needs real sessions, is slower, and leaves test
data behind unless every test cleans up.

**Consequences.** Tests run inside the database, in a transaction, in well under a second.
They do not exercise PostgREST itself, so grants are asserted explicitly rather than
assumed.

---

## ADR-0011 — Explicit, least-privilege grants on every table

**Date**: 2026-09-27 · **Status**: accepted

**Context.** Supabase stopped granting `anon` and `authenticated` access to new `public`
tables automatically: the default for new projects from 2026-05-30, enforced on all
projects from 2026-10-30. Staging will be a new project. Even the remaining default
privileges include `truncate`, which row level security does not apply to.

**Decision.** `auto_expose_new_tables = false` locally, so local matches staging. Every
table's migration revokes all privileges from `anon` and `authenticated`, then grants back
only the operations its policies are written for, using column-level `update` grants where
some columns must never be user-editable. `anon` gets nothing in Phase 1.

**Rejected.** Relying on the old default grants, which would work locally and break on
staging. Granting everything to `authenticated` and relying on RLS alone, which leaves
`truncate` open and makes a missing policy the only line of defence.

**Consequences.** Grants and policies are two layers that must agree: a missing grant is a
loud `42501 permission denied`, a missing policy is a silent empty result. Each new table
or column now needs a deliberate grant.

---

## Deferred decisions

Recorded so they are not silently forgotten:

- **AWS deployment** of the same Docker image, after the roadmap completes.
- **Nuxt 5 and Nitro 3 migration**, once Nitro 3 is stable and the module ecosystem has
  caught up.
- **Custom access token hook** to move org roles into JWT claims. Only worth it if policy
  performance measurably suffers; database lookups through the `security definer` helpers
  are correct and revoke immediately, which is the better default.
- **Redis-backed Nitro cache storage**, needed only if the app runs more than one
  instance.
