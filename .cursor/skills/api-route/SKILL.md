---
name: api-route
description: Builds a Nitro API endpoint in trade-log under server/api/ with requireUser and requireOrgRole, Zod validation at the boundary, the RLS-enforced serverSupabaseClient, and errors from server/utils/errors.ts. Use when creating or changing a server route, an endpoint under /api, a CRUD handler, request validation, or the Supabase calls behind them.
---

# Nitro API route

## Prerequisites

`server/utils/require-user.ts` and `server/utils/require-org-role.ts` are built in Phase 1
M5. If they don't exist yet, stop and say so. Don't inline an auth check in a route as a
stopgap.

## File layout

Routes are file-based: `server/api/<resource>/index.get.ts`, `index.post.ts`,
`[id].get.ts`, `[id].patch.ts` and `[id].delete.ts`. Zod schemas live in
`shared/schemas/<resource>.ts` so the app's forms can reuse them, and are imported
through `#shared/schemas/<resource>`. Use explicit relative imports for `server/utils`,
matching `server/api/health.get.ts`.

## Skeleton

```ts
import { serverSupabaseClient } from '#supabase/server'
import { z } from 'zod'

import { thingUpdateSchema } from '#shared/schemas/thing'
import { badRequest, notFound } from '../../utils/errors'
import { requireUser } from '../../utils/require-user'

const paramsSchema = z.object({ id: z.uuid() })

/**
 * Updates one of the caller's things. Another member's thing is invisible under RLS, so
 * it surfaces as 404 rather than 403.
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)

  const params = await getValidatedRouterParams(event, (p) => paramsSchema.safeParse(p))
  if (!params.success) throw badRequest({ message: 'Invalid id' })

  const body = await readValidatedBody(event, (b) => thingUpdateSchema.safeParse(b))
  if (!body.success) {
    throw badRequest({ data: { issues: z.flattenError(body.error).fieldErrors } })
  }

  const client = await serverSupabaseClient(event)
  const { data, error } = await client
    .from('things')
    .update(body.data)
    .eq('id', params.data.id)
    .select('id, name, updated_at')
    .maybeSingle()

  if (error) throw mapDbError(error)
  if (!data) throw notFound()

  return data
})
```

## Rules this skeleton encodes

- **The first line is `requireUser(event)`.** Where a route takes an org (from Phase 2,
  `/app/[org]/...`), call `requireOrgRole(event, orgId, roles)` next. Client middleware
  never counts as protection.
- **Validate with `safeParse`, never with `parse`.** If the validator throws, h3 builds
  its own 400 and copies the whole Zod error into `data`, which bypasses `errors.ts`.
  With `safeParse`, h3 returns the result and the route raises `badRequest` itself. Once
  a third route repeats this block, extract a verb-named helper into `server/utils/`.
- **`user_id` and `org_id` never come from the request body.** `user_id` comes from
  `requireUser`, and `org_id` comes from a row the caller can already see (for example
  the account a trade belongs to). Keep them out of the Zod schemas entirely.
- **Use `serverSupabaseClient(event)` only.** The service-role client is allowed only for
  invitations, the Stripe webhook and organisation deletion, each with a comment naming
  why. The Drizzle admin client is for aggregates and tasks, and every query must filter
  by `org_id`. Create clients inside the handler, never at module scope.
- **Missing rows are 404, not 403.** RLS filters other people's rows out, so an update or
  delete on them returns nothing. Use `.maybeSingle()` and turn `null` into
  `notFound()`.
- **Every error comes from `server/utils/errors.ts`.** Don't call `createError` directly.
  Use `event.path` and `getRequestHeaders(event)`, never `event.node.*`.
- **Never read `process.env`.** Use `useRuntimeConfig(event)`. A new variable goes into
  `.env.example` in the same commit.
- **Write a doc comment above the handler** that explains intent or constraints, not the
  steps.

## Mapping database errors

`mapDbError` is the small helper built in M6, living in `server/utils/`. Until it exists,
create it alongside the first route that needs it. Map these codes:

| Code    | Meaning                                       | Helper            |
| ------- | --------------------------------------------- | ----------------- |
| `42501` | grant or `with check` refused                 | `forbidden()`     |
| `23503` | foreign key, e.g. an account that isn't yours | `unprocessable()` |
| `23505` | unique violation                              | `conflict()`      |
| `23514` | check constraint                              | `unprocessable()` |
| `22P02` | invalid input syntax, e.g. a bad uuid         | `badRequest()`    |
| other   | unexpected                                    | `internalError()` |

Never put the raw Postgres message into the response. Log it on the server and return
the generic helper.

## Facts about the module

- `serverSupabaseUser(event)` returns verified **JWT claims** (`JwtPayload`), not a
  `User`. The user id is `claims.sub`. Never use `serverSupabaseSession`, because the
  session comes from the client.
- `serverSupabaseClient(event)` is async and typed by `Database`. After `npm run
db:types`, column types come from `app/types/database.types.ts`.
- PostgREST returns `numeric` columns as strings. Convert them in one deliberate place
  (`shared/utils/`, from M4), not with `parseFloat` scattered through handlers.

## Before finishing

- [ ] A route-level manual check: curl as user A against user B's resource returns 404
- [ ] Any new pure logic has a Vitest test
- [ ] Run the security checklist in `docs/security.md` (or the `finish-task` skill)
