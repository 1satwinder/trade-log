import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { H3Event } from 'h3'
import postgres from 'postgres'

import { internalError } from '../utils/errors'

/**
 * The Drizzle admin client.
 *
 * This talks to Postgres over the wire protocol as a privileged role, so it bypasses row
 * level security silently — no error, just rows a policy would have hidden. It is limited
 * to aggregates, reporting and scheduled tasks, and every query it runs has to filter by
 * org_id itself. User-facing reads and writes go through serverSupabaseClient(event)
 * instead. See docs/architecture.md.
 */

// The "never create a client at module scope" rule targets Supabase clients, which carry
// a user session and would leak it across requests. This pool carries no identity, and
// Render runs one persistent process, so a single lazily built pool is the right shape.
let pool: ReturnType<typeof postgres> | undefined
let database: PostgresJsDatabase | undefined

export function useAdminDb(event: H3Event): PostgresJsDatabase {
  if (!database) {
    const { databaseUrl } = useRuntimeConfig(event)

    if (!databaseUrl) {
      throw internalError({ message: 'NUXT_DATABASE_URL is not configured' })
    }
    // PostgreSQL client for Node.js with nitro as web server for backend
    pool = postgres(databaseUrl, {
      max: 10,
      // Session-mode connection, so prepared statements are safe. Behind Supabase's
      // transaction pooler on port 6543 this must become `prepare: false`, or the second
      // request fails with "prepared statement already exists".
      prepare: true,
    })

    database = drizzle(pool, { casing: 'snake_case' })
  }

  return database
}
