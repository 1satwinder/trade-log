# Plan: Tradelog

Canonical statement of what is being built and why. Mechanism lives in
[architecture.md](architecture.md); reasoning lives in [decisions.md](decisions.md);
progress lives in [roadmap.md](roadmap.md).

## The product, in one paragraph

An organisation (a small trading desk, a prop-firm cohort, or a trading coach with
students) signs up. Each member logs trades into their own accounts: symbol, side, size,
entry and exit, fees, thesis, tags, chart screenshots. The app computes P&L, win rate,
average R multiple and an equity curve. A **member sees only their own trades**; an
**owner or admin sees everyone's in the organisation**. Members can publish a read-only
public journal page for a single account. Owners pay for Pro via Stripe.

That role-dependent row visibility is the reason for choosing this product. It is a
genuine authorisation problem, not "everyone in the tenant sees everything", so the row
level security work is real rather than decorative.

## Why this product rather than a generic SaaS

Three reasons, in order of weight:

1. **Learning per line of code.** The schema is tiny — organisations, memberships,
   accounts, trades, tags — yet it produces a real authorisation problem, a natural
   public surface, and an obvious need for scheduled work.
2. **Domain leverage.** Existing professional experience in web-based financial trading
   systems (watchlists, holdings, order entry, market-data widgets) makes the domain
   modelling credible and fast.
3. **Clear separation from prior work.** The existing trading dashboard demonstrates
   frontend depth. This project's story is auth, data modelling, tenancy and operations,
   so it does not merely repeat the earlier project.

## Non-goals (the scope fence)

No broker integrations beyond one price provider. No live order placement. No mobile
app. No internationalisation. No notification centre. No admin back-office. No
multi-currency reporting. No AI features.

When tempted, check the concept map below: if a feature does not teach a listed concept,
it does not go in. New feature ideas go to [roadmap.md](roadmap.md) under "Parked".

## Concept-to-feature map

Every concept to be learned is pinned to exactly one feature, so nothing is built "just
because":

- Static generation and prerendering: marketing and pricing pages
- ISR / stale-while-revalidate caching: public shared journal page `/j/[slug]` and its
  dynamic OG image
- SSR with a cookie-based session: the whole `/app` area
- Nitro API routes, schema validation, typed errors: trades CRUD
- Postgres schema, migrations, seeding: the domain tables
- Schema-as-code and generated types: Drizzle schema plus drizzle-kit
- Row level security with roles: member-versus-manager trade visibility
- Deliberate privilege escalation on the server: invitations, billing sync, org deletion
- Webhooks: Stripe, with signature verification and idempotency
- Scheduled work: nightly closing-price refresh
- Realtime: live marks on open positions and a team activity feed
- Object storage with signed URLs: trade chart screenshots
- Server caching and rate limiting: quote lookups, invite and public endpoints
- Testing: unit tests for calculations, SQL-level RLS tests, one end-to-end happy path
- Operations: Docker image, CI, deployment, environment separation

## Definition of done for the project as a whole

- A stranger can open the public URL, click "try the demo", and understand the product
  within a minute.
- Member A provably cannot read member B's trades, and there is an automated test that
  fails if that ever changes.
- The entire schema, including every policy, exists as migration files in git and can be
  rebuilt from scratch with one command.
- The app deploys from a clean checkout with no manual dashboard steps beyond setting
  secrets.
- Each decision in [decisions.md](decisions.md) can be defended out loud, including what
  was rejected and why.

## Explicitly deferred

Kept out of scope now, revisited only after the roadmap completes: an AWS deployment of
the same Docker image (ECS Fargate or App Runner), a Nuxt 5 and Nitro 3 migration, a
second frontend in React or Next.js sharing the same API, and broker CSV import beyond a
single format.
