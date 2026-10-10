import { serverSupabaseClient } from '#supabase/server'
import { tradeIdParamsSchema, tradeUpdateSchema } from '#shared/schemas/trade'
import { withTradeStats } from '#shared/utils/trade-stats'

import { mapDatabaseError, notFound } from '../../utils/errors'
import { requireUser } from '../../utils/require-user'

/**
 * Edits one of the caller's own trades.
 *
 * The update policy's `using` clause only matches the caller's own rows, so someone
 * else's trade updates zero rows and answers 404. That includes a manager, who can read
 * a member's trade but not change it. Cross-field rules the patch alone cannot decide,
 * such as adding an exit to a trade that stays open, fall to the check constraints and
 * answer 422.
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const { id } = await getValidatedRouterParams(event, tradeIdParamsSchema.parse)
  const patch = await readValidatedBody(event, tradeUpdateSchema.parse)
  const client = await serverSupabaseClient(event)

  const { data, error } = await client
    .from('trades')
    .update(patch)
    .eq('id', id)
    .select('*')
    .maybeSingle()

  if (error) throw mapDatabaseError(error)
  if (!data) throw notFound({ message: 'Trade not found' })

  return withTradeStats(data)
})
