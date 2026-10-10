import { serverSupabaseClient } from '#supabase/server'
import { tradeIdParamsSchema } from '#shared/schemas/trade'
import { withTradeStats } from '#shared/utils/trade-stats'

import { mapDatabaseError, notFound } from '../../utils/errors'
import { requireUser } from '../../utils/require-user'

/**
 * One trade. A trade the caller may not see is filtered out by RLS before the query
 * returns, so it answers 404 exactly like an id that does not exist.
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const { id } = await getValidatedRouterParams(event, tradeIdParamsSchema.parse)
  const client = await serverSupabaseClient(event)

  const { data, error } = await client
    .from('trades')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw mapDatabaseError(error)
  if (!data) throw notFound({ message: 'Trade not found' })

  return withTradeStats(data)
})
