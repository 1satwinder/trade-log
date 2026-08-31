# Phase 0 — Foundation

Record of how Phase 0 was built and what it left behind. Progress lives in
[roadmap.md](../roadmap.md); this file is the working detail that the roadmap's checklist
deliberately omits.

## Whether a plan per phase is worth writing

Selectively. The roadmap states what and the exit criteria; it does not state order,
mechanism, or where the traps are. Phase 0 benefited least, because it is linear
scaffolding. Phases 1, 2 and 4 are where a plan earns its keep, and each should be written
only once the previous phase has closed, since its outcome changes the next.

## Scope change made up front

"Create the managed staging Supabase project" moved to Phase 1, next to the Render deploy
item, because it needs the Supabase dashboard. Phase 0 is therefore entirely local.

## Build order

Conventions landed before the integrations that depend on them, so nothing had to be
retrofitted.

1. Nuxt 4.5 scaffold — TypeScript strict, npm, ESLint, Prettier.
2. Tailwind and Nuxt UI, with a bare layout and index page.
3. `runtimeConfig`, `.env.example`, `.nvmrc`, and `server/utils/errors.ts`.
4. `@nuxtjs/supabase` with `useSsrCookies: true`.
5. Local Supabase CLI stack in Docker, then `supabase db reset`.
6. Drizzle, `drizzle.config.ts` and the admin client.
7. The `/api/health` smoke-test route.

## What was actually installed

| Package            | Version | Note                                              |
| ------------------ | ------- | ------------------------------------------------- |
| `nuxt`             | 4.5.2   | Nitro 2.13.4, Vite 8.2.2, Vue 3.5.42              |
| `@nuxt/ui`         | 4.11.0  | Brings Tailwind 4.3.3 and `@tailwindcss/vite`     |
| `@nuxtjs/supabase` | 2.0.10  | `secretKey`; `serviceKey` warns as deprecated     |
| `drizzle-orm`      | 0.45.2  | With `postgres` 3.4.9 as the driver               |
| `drizzle-kit`      | 0.31.10 | Generates DDL only; the Supabase CLI applies it   |
| `supabase`         | 2.116.0 | Dev dependency, so no global CLI install required |

## Decisions taken while building

- **No separate Tailwind module.** Nuxt UI 4 depends on `tailwindcss` and
  `@tailwindcss/vite` and registers the Vite plugin itself. Adding `@nuxtjs/tailwindcss`
  on top would give two competing setups. Tailwind is installed as a direct dependency
  because Nuxt UI treats it as a peer, and the wiring is two `@import` lines in
  [app/assets/css/main.css](../../app/assets/css/main.css).
- **`secretKey` is not set in `nuxt.config.ts`.** The module registers it as
  `runtimeConfig`, so `NUXT_SUPABASE_SECRET_KEY` supplies it at runtime. Writing
  `process.env` into the config would inline the value at build time and break the Docker
  image, where secrets arrive at run time.
- **`redirect: false` and `types: false` on the Supabase module, temporarily.** There is no
  `/login` page and no generated database types until Phase 1. Both are marked in
  [nuxt.config.ts](../../nuxt.config.ts) as Phase 1 work.
- **The Drizzle pool is a module-scope singleton, created lazily.** The "never create a
  client at module scope" rule targets Supabase clients, which carry a user session. A
  postgres.js pool carries no identity, and Render runs one persistent process, so one
  pool is correct. The distinction is commented at the call site in
  [server/db/client.ts](../../server/db/client.ts).
- **The smoke test is `/api/health`, not a throwaway route.** It becomes the Dockerfile
  healthcheck in Phase 6. It goes through the Drizzle admin client because that is the
  only data path that exists before auth lands, and it queries Postgres so that it proves
  the wire-protocol connection rather than only proving Nitro is up.
- **No scratch table.** `supabase/migrations/` holds only a `.gitkeep`, so Phase 1 owns the
  first migration. `supabase db reset` still exercises the full rebuild loop and correctly
  skips the `.gitkeep` because it does not match `<timestamp>_name.sql`.
- **`drizzle.config.ts` is the one sanctioned `process.env` reader.** It is loaded by the
  drizzle-kit CLI, outside Nitro, where `useRuntimeConfig` does not exist. It calls
  `process.loadEnvFile('.env')`, which Node 22 provides, so no dotenv dependency is needed.

## Verified

- `npm run dev` serves the app shell, and Tailwind utilities appear in the built CSS.
- `npm run db:reset` rebuilds the local database and reports `Reset local database.`
- `curl localhost:3000/api/health` returns
  `{"status":"ok","database":"postgres","serverTime":"..."}`.
- `npm run lint`, `npm run typecheck` and `npm run format:check` are all clean.
- No secret is referenced outside `runtimeConfig`, except `drizzle.config.ts` as above.

## Left for Phase 1

- The domain schema in [server/db/schema.ts](../../server/db/schema.ts), which is an empty
  placeholder.
- The first migration under `supabase/migrations/`, plus `seed.sql`.
- Supabase module `redirect` and `types`, once `/login`, `/confirm` and the generated
  database types exist.
- Creating the managed staging Supabase project, moved here from Phase 0.
