# Server-rendered trade list

**Trigger**: a signed-in member opens `/app/trades` · **Outcome**: the HTML already
contains only the trades they may see, and the browser hydrates it without refetching
**Status**: built in Phase 1 M7. The route moves to `/app/[org]/trades` in Phase 2.
**Last verified**: 2026-10-10, against the local stack with `curl` as Sam (14 rows) and
Maya (44, or 16 with `?mine=1`), and in the browser with console warnings captured, from
both `nuxt dev` and the Docker image running in UTC

## Sequence

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser
  participant S as Nuxt SSR
  participant N as Nitro
  participant R as PostgREST
  participant P as Postgres

  B->>S: GET /app/trades (Cookie sb-127-auth-token)
  S->>N: useFetch('/api/trades') via event.$fetch, in-process, cookie forwarded
  N->>N: requireUser verifies the JWT signature
  alt no valid session
    N-->>S: 401
    S-->>B: error page (the client guard has usually redirected to /login first)
  else signed in
    N->>R: select trades, Bearer JWT
    R->>P: set local role authenticated
    P-->>R: rows the select policy allows
    N->>R: select profiles where id in (trade owners)
    R-->>N: display names the profiles policy allows
    N-->>S: trades with realised_pnl, r_multiple, trader_name
    S->>S: render the stats strip and table; dates as time elements in server time
    S-->>B: HTML plus the same rows in __NUXT_DATA__
    B->>B: onPrehydrate rewrites each time element in the browser's timezone
    B->>B: hydrate from __NUXT_DATA__, no second request
  end
```

## What each step guarantees

| Step | Guarantee                                                                    | Enforced in                                       |
| ---- | ---------------------------------------------------------------------------- | ------------------------------------------------- |
| 2    | The render acts as the visitor, not as the server: their cookie is forwarded | Nuxt `useRequestFetch`, used by `useFetch`        |
| 3    | A forged or expired cookie gets nothing                                      | `server/utils/require-user.ts`                    |
| 8    | Only the caller's own trades, or every trade in orgs they manage             | trades select policy, `20260927170337_*.sql`      |
| 10   | Trader names only for fellow members                                         | profiles select policy, same migration            |
| 14   | Dates match the browser's timezone without a hydration mismatch              | `<NuxtTime>` in `app/components/trades/Table.vue` |

The "Only mine" toggle is a query string, `?mine=1`, filtered in the page. It is a view
over rows the policy already allowed, not a security boundary, and it is a plain link, so
it works with JavaScript turned off.

## Files involved

- `app/pages/app/trades/index.vue`: `useFetch`, the filter and `tradeStats`
- `app/components/trades/StatsStrip.vue` and `Table.vue`: the rendered output
- `server/api/trades/index.get.ts`: the route, including the trader-name lookup
- `shared/utils/trade-stats.ts`: the same P&L and R functions on both sides
- `app/utils/format.ts`: number formatting with a fixed locale, for the same reason as
  `<NuxtTime>`

## Related

- [request-authorisation.md](request-authorisation.md), which expands steps 6 to 8
- [magic-link-login.md](magic-link-login.md), which produces the cookie in step 1
- ADR-0013 for why step 3 is a signature check and not a call to Auth
