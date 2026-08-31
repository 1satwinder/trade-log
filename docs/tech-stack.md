# Tech stack

Every dependency, what it is for, and the version constraint that matters. Reasoning for
the contested choices lives in [decisions.md](decisions.md).

## Runtime and framework

| Thing           | Choice                        | Note                                                                                 |
| --------------- | ----------------------------- | ------------------------------------------------------------------------------------ |
| Framework       | Nuxt 4.5.x                    | Nuxt 3 reached end of life on 31 July 2026. Nuxt 5 and Nitro 3 are not released yet. |
| Server engine   | Nitro 2 (bundled with Nuxt 4) | Tasks API is behind `experimental.tasks`. Stabilises in Nitro 3.                     |
| Language        | TypeScript, strict            |                                                                                      |
| Node            | 22 LTS                        | Matches the Render runtime and the Docker base image.                                |
| Package manager | npm                           |                                                                                      |

### Nuxt 5 readiness

Nuxt 5 brings Nitro 3, built on srvx and h3 v2, which moves the server to Web-standard
`Request` and `Response`. Three habits keep the future migration boring, and they cost
nothing now:

- Never touch `event.node.*`; use `event.path` and `getRequestHeaders(event)`.
- Create every error through `server/utils/errors.ts`, because `statusCode` and
  `statusMessage` become `status` and `statusText`.
- Remember that `nitropack` is renamed to `nitro`, so avoid importing from it directly.

## Data and auth

| Thing            | Choice                               | Why                                                                                     |
| ---------------- | ------------------------------------ | --------------------------------------------------------------------------------------- |
| Database         | Supabase Postgres (managed)          | Postgres with RLS, plus auth, realtime and storage in one place.                        |
| Local database   | Supabase CLI stack in Docker         | `db reset` replays migrations and seed in seconds; gives CI a disposable database.      |
| Auth             | Supabase Auth via `@nuxtjs/supabase` | Wraps `supabase-js` and `@supabase/ssr`; provides the cookie plumbing for SSR sessions. |
| Schema and types | Drizzle plus drizzle-kit             | Schema as code, generated DDL, generated TypeScript types.                              |
| Postgres driver  | postgres.js                          | Used only by the Drizzle admin client.                                                  |
| Migration runner | Supabase CLI only                    | One runner, one ordering, no ambiguity.                                                 |
| Validation       | Zod                                  | At every route boundary.                                                                |

Key naming note: `@nuxtjs/supabase` has moved to Supabase's JWT signing keys. Use
`secretKey` and `NUXT_SUPABASE_SECRET_KEY`; the older `serviceKey` option is deprecated.

## UI

| Thing      | Choice                                                   | Why                                                                              |
| ---------- | -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Styling    | Tailwind                                                 | Fast, and the existing SCSS skills transfer.                                     |
| Components | Nuxt UI                                                  | Avoids spending the project's budget on a design system.                         |
| Tables     | TanStack Table, or AG Grid if the trade blotter needs it | Start with the lighter option; AG Grid is already familiar if requirements grow. |
| Charts     | A lightweight charting library for the equity curve      | TradingView's widget is not needed here; this is not a charting project.         |

## Third-party services

| Thing       | Choice                                           | Note                                                                                                     |
| ----------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Billing     | Stripe                                           | Checkout plus Customer Portal, and one webhook endpoint.                                                 |
| Email       | Resend                                           | Invitations and the weekly summary. Called only from Nitro.                                              |
| Market data | Finnhub or Alpaca                                | Already familiar from the earlier trading dashboard. Proxied through Nitro so the key stays server-side. |
| Hosting     | Render, Docker image, Nitro `node-server` preset | Persistent process means in-process cron via croner and no pooler workarounds.                           |

## Testing and quality

| Thing           | Choice                                     | Scope                                                          |
| --------------- | ------------------------------------------ | -------------------------------------------------------------- |
| Unit            | Vitest                                     | P&L, win rate, R multiple, Zod schemas, pure utilities.        |
| Database        | SQL tests run against the local stack      | The RLS invariants. These are the tests that matter most.      |
| End to end      | Playwright                                 | Exactly one happy path, kept fast enough to run on every push. |
| Lint and format | ESLint with the Nuxt config, plus Prettier |                                                                |
| CI              | GitHub Actions                             | Lint, typecheck, unit tests, RLS tests.                        |

## Connection string reference

Three different connection targets, and using the wrong one causes confusing failures:

- **PostgREST via `supabase-js`** — normal application access, RLS applies.
- **Session-mode Postgres connection** — the Drizzle admin client on Render's persistent
  process.
- **Direct connection, port 5432** — migrations only.

If the app ever runs on a serverless platform, the transaction pooler on port 6543 is
required, and postgres.js must be configured with `prepare: false` or production fails
with "prepared statement already exists" on the second request.

## Deliberately not used

- **An ORM as the user-facing data client.** It bypasses RLS silently. See
  [decisions.md](decisions.md), ADR-0004.
- **Prisma.** Heavier, and its pooler workarounds add friction with Supabase.
- **A separate backend service.** Nitro is the backend; a second service would add
  deployment complexity without teaching anything new here.
- **Pinia.** Server state is fetched per route and the active organisation lives in the
  URL. A store would be added only if a real need appears.
