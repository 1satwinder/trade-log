import { serverSupabaseClient } from '#supabase/server'
import { tradeIdParamsSchema } from '#shared/schemas/trade'

import { mapDatabaseError, notFound } from '../../utils/errors'
import { requireUser } from '../../utils/require-user'

/**
 * Deletes one of the caller's own trades. As with PATCH, a trade the delete policy does
 * not match is invisible to the statement, so it answers 404, not 403.
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const { id } = await getValidatedRouterParams(event, tradeIdParamsSchema.parse)
  const client = await serverSupabaseClient(event)

  // Without .select() PostgREST does not report how many rows were deleted.
  const { data, error } = await client
    .from('trades')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle()

  if (error) throw mapDatabaseError(error)
  if (!data) throw notFound({ message: 'Trade not found' })

  return sendNoContent(event)
})
