# Roadmap

Progress tracker. Each phase ends with something deployed and demonstrable, and has exit
criteria that are checkable rather than vibes. Phases 0 to 2 are the core learning; 3 to 6
are what make it look like a product.

How to use this file: tick items as they land, and when a phase closes, write what was
learned and what broke into [learning-log.md](learning-log.md). Do not start a phase
before the previous one's exit criteria are met — the exit criteria are the point.

Status: **Phase 0 complete. Phase 1 built and live on Render; close-out checks (M9)
pending.**

Each phase gets a short plan written just before it starts, and that file becomes the
record of how it was built. See [plans/phase-0.md](plans/phase-0.md).

---

## Phase 0 — Foundation

- [x] Scaffold Nuxt 4.5 with TypeScript strict, npm, ESLint and Prettier
- [x] Tailwind and Nuxt UI, with a bare app shell and layout
- [x] Add `@nuxtjs/supabase` with `useSsrCookies: true` and `secretKey` configuration
- [x] Bring up the local Supabase CLI stack in Docker and confirm `supabase db reset`
- [x] Add Drizzle, `drizzle.config.ts` and the admin client in `server/db/`
- [x] `runtimeConfig` and `.env.example` covering every secret
- [x] `server/utils/errors.ts` as the single error factory
- [x] `git init` and first commit with the docs

Phase 0 is entirely local. Creating the managed staging Supabase project needs the
Supabase dashboard, so it sits with the deploy work in Phase 1 rather than here.

**Exit criteria.** `npm dev` runs, the local Supabase stack is reachable, a smoke-test
Nitro route reads from Postgres, and no secret is referenced outside `runtimeConfig`.

---

## Phase 1 — Auth and the core domain

- [x] Drizzle schema for `profiles`, `accounts`, `trades`, `tags`, `trade_tags`
- [x] Generate DDL and land it as timestamped Supabase migrations
- [x] Trigger on `auth.users` to create a `profiles` row on signup
- [x] Auto-create a personal organisation and owner membership on signup, in the same
      trigger (ADR-0009)
- [x] `private` schema `security definer` helpers, with execute revoked from `anon`
- [x] RLS enabled on every table, with per-operation policies
- [x] Indexes for every policy predicate
- [x] Login, logout and the `/confirm` callback working through SSR cookies
- [x] Trades CRUD as Nitro routes using `serverSupabaseClient`, validated with Zod
- [x] `requireUser` and `requireOrgRole` utilities
- [x] Trade list and trade detail pages
- [x] SQL RLS tests: member A cannot read, update or delete member B's trades
- [x] Vitest units for P&L, win rate and R multiple
- [x] `seed.sql` with a believable demo organisation
- [x] Create the managed staging Supabase project
- [x] Deploy to Render and confirm the deployed app works against staging Supabase

**Exit criteria.** Two seeded users can each log trades and provably cannot see each
other's, verified by a test that fails if a policy is loosened. The app is live on a
Render URL.

---

## Phase 2 — Multi-tenancy and roles

- [ ] `organizations`, `memberships`, `invitations` schema and policies
- [ ] `/app/[org]/...` routing with a server-side org access guard
- [ ] Organisation switcher
- [ ] Invite flow using the service-role client: hashed tokens, expiry, seat-limit check
- [ ] Invite email through Resend
- [ ] `/accept-invite/[token]` page and acceptance handler
- [ ] Role-dependent trade visibility so owners and admins see the whole organisation
- [ ] Team page with role management, restricted to owners and admins
- [ ] RLS tests extended: role escalation attempts, cross-org access attempts

**Exit criteria.** A manager sees every member's trades; a member sees only their own.
Invites work end to end from a real email. Every service-role call site has a comment
justifying the bypass.

---

## Phase 3 — Public surface and rendering

- [ ] Prerendered marketing and pricing pages
- [ ] Public shared journal page `/j/[slug]`, served with `swr` and no session
- [ ] Dynamic OG image endpoint
- [ ] SEO meta, sitemap, robots
- [ ] Share-link creation, revocation and expiry
- [ ] Confirm the rendering mode of every route: prerender, `swr`, or SSR without cache
- [ ] One-click demo login

**Exit criteria.** A logged-out visitor loads a share link with no session and sees only
what the owner published. `curl` on the marketing page returns full HTML. The demo login
works from a private browser window.

---

## Phase 4 — Billing

- [ ] Stripe products and a Pro tier
- [ ] Checkout session route and Customer Portal route
- [ ] Webhook handler with raw-body signature verification
- [ ] `stripe_events` idempotency table, verified by replaying an event
- [ ] Entitlements enforced server-side: free tier caps accounts, trades and share links
- [ ] Billing settings page, restricted to owners

**Exit criteria.** A test-mode upgrade and downgrade both work, the webhook is safe to
replay, and entitlement checks cannot be bypassed by calling the API directly.

---

## Phase 5 — Async and realtime

- [ ] Enable `nitro.experimental.tasks` and add `quotes:refresh` on a schedule
- [ ] `quote_cache` populated through the Drizzle admin client
- [ ] Equity curve and win-rate aggregates as Drizzle queries
- [ ] SSE or polled Nitro endpoint proxying live quotes, keeping the API key server-side
- [ ] Supabase realtime channel for the team activity feed
- [ ] `cachedEventHandler` for quote lookups
- [ ] Rate limiting on invite and public endpoints
- [ ] Supabase Storage: chart screenshot upload with signed URLs and path-prefix tenancy

**Exit criteria.** The scheduled task runs unattended in production and is visible in
logs. Open positions mark live without the browser ever seeing a provider key. Attachments
cannot be read across organisations.

---

## Phase 6 — Quality and ship

- [ ] Playwright happy path: sign up, create org, log a trade, invite a teammate, publish
      a share link, view it anonymously
- [ ] GitHub Actions CI: lint, typecheck, unit tests, RLS tests against a local stack
- [ ] Harden the Dockerfile: multi-stage, non-root user, healthcheck
- [ ] Promote Render to production with the production Supabase project and live Stripe
- [ ] README with quickstart, architecture diagram and the authorisation walkthrough
- [ ] [decisions.md](decisions.md) reviewed and complete
- [ ] [demo-script.md](demo-script.md) rehearsed once, out loud, against production

**Exit criteria.** CI is green on a clean checkout, the production URL is stable, and the
three-minute demo runs without touching anything not in the script.

---

## Parked ideas

Captured so they stop competing for attention. Nothing here gets built before Phase 6
closes.

- Broker CSV import beyond one format
- Weekly summary email with performance highlights
- Trade replay against historical candles
- Cohort leaderboard for coaching organisations
- Public API with personal access tokens
- AWS deployment of the same Docker image
- Nuxt 5 and Nitro 3 migration write-up
