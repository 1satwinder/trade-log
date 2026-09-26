# Conventions and guardrails

Rules for anyone — human or AI agent — writing code in this repository. Read
[docs/architecture.md](docs/architecture.md) and [docs/security.md](docs/security.md)
before touching data access.

## Purpose of this project shapes how to work in it

This is a learning project. Prefer the explicit, readable implementation over the clever
one. Do not add abstraction until there are three call sites. Do not add a dependency that
removes a concept the project exists to teach — for example, do not install a
multi-tenancy or auth starter kit.

When a task is finished, say what was learned or what was surprising, so it can go into
[docs/learning-log.md](docs/learning-log.md).

## Hard rules

1. **Never use the Drizzle admin client or the service-role client for user-facing
   queries.** Default to `serverSupabaseClient(event)` so RLS applies. Service-role use is
   confined to invitations, the Stripe webhook and organisation deletion, and every call
   site carries a comment naming why.
2. **Never make a schema change outside a migration file.** No dashboard edits. Generate
   DDL with drizzle-kit, then land it as `supabase/migrations/<timestamp>_<name>.sql`.
   Renaming from Drizzle's `0000_*` output is required, not optional.
3. **Every new table gets RLS enabled and per-operation policies in the same migration.**
   A table without policies is a bug, not a to-do.
4. **Every route starts with `requireUser(event)`**, plus `requireOrgRole` where an
   organisation is involved. Client middleware never counts as protection.
5. **Never read `process.env` at a call site.** Everything goes through `runtimeConfig`,
   and new variables are added to `.env.example` in the same commit.
6. **Never create a Supabase client at module scope on the server.** Per request, always.
7. **No `event.node.*`.** Use `event.path` and `getRequestHeaders(event)`. Create errors
   only through `server/utils/errors.ts`.

## Code style

- TypeScript strict. No `any`; if a type is genuinely unknown, use `unknown` and narrow.
- Validate input with Zod at the route boundary. Handlers receive typed, validated data.
- Vue 3 with the Composition API and `<script setup lang="ts">`.
- Composables own client state and are named `useThing`. Server helpers live in
  `server/utils/` and are named as verbs: `requireUser`, `resolveOrg`.
- Group components by feature, not by type.
- Comments explain constraints and intent, never what the next line does. No comments
  narrating the change being made.
- SQL keywords lowercase, matching the Supabase docs style, so migrations read
  consistently.
- Write a comment before every new function

## Naming

- Database: `snake_case` tables and columns, plural table names.
- TypeScript: `camelCase` variables, `PascalCase` types and components.
- Routes: `/app/[org]/...` for authenticated pages, `/j/[slug]` for public journals,
  `/api/...` for Nitro endpoints.
- Migrations: `<timestamp>_<verb>_<subject>.sql`, for example
  `20260901120000_add_trades_policies.sql`.

## Testing expectations

- Pure calculations (P&L, win rate, R multiple) get Vitest unit tests. These are the
  cheapest tests here and cover the logic most likely to be quietly wrong.
- Anything touching tenancy gets a SQL-level RLS test. New policy, new test — no
  exceptions.
- Exactly one Playwright happy path, kept fast. Resist growing it into a suite.
- A bug fix gets a test that would have caught it.

## Definition of done for a task

- [ ] Works locally against the local Supabase stack
- [ ] Types pass, lint passes
- [ ] Tests added where the rules above require them
- [ ] The security checklist in [docs/security.md](docs/security.md) has been run if data
      access changed
- [ ] Docs updated in the same commit: [docs/data-model.md](docs/data-model.md) for schema,
      [docs/architecture.md](docs/architecture.md) for mechanism,
      [docs/decisions.md](docs/decisions.md) for a decision with a real alternative
- [ ] The roadmap item is ticked in [docs/roadmap.md](docs/roadmap.md)

## Commits

Conventional-commit prefixes (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).
Small commits, present tense, explaining why rather than restating the diff. Migrations
commit together with the code that depends on them.

## When blocked or when the plan seems wrong

Say so rather than improvising around it. If a decision in
[docs/decisions.md](docs/decisions.md) turns out to be wrong, the fix is a new decision
entry that supersedes it, not a silent deviation in code.
