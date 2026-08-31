import { sql } from 'drizzle-orm'

import { useAdminDb } from '../db/client'
import { internalError } from '../utils/errors'

/**
 * Phase 0 smoke test, and the endpoint the Dockerfile healthcheck will use in Phase 6.
 *
 * It goes through the Drizzle admin client on purpose: that is the only data path that
 * exists before authentication lands in Phase 1, and querying Postgres directly proves
 * the wire-protocol connection works rather than only proving Nitro is up.
 */
export default defineEventHandler(async (event) => {
  const db = useAdminDb(event)

  const rows = await db.execute<{ database: string; server_time: Date }>(
    sql`select current_database() as database, now() as server_time`,
  )

  const row = rows[0]

  if (!row) {
    throw internalError({ message: 'Database reachable but returned no rows' })
  }

  return {
    status: 'ok',
    database: row.database,
    serverTime: row.server_time,
  }
})
