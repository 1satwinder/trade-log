import { serverSupabaseClient } from '#supabase/server'
import { tradeIdParamsSchema } from '#shared/schemas/trade'
import type { TradeDetailResponse } from '#shared/types/trade'
import { withTradeStats } from '#shared/utils/trade-stats'

import { mapDatabaseError, notFound } from '../../utils/errors'
import { requireUser } from '../../utils/require-user'

/**
 * One trade, with its account and its trader's name. A trade the caller may not see is
 * filtered out by RLS before the query returns, so it answers 404 exactly like an id that
 * does not exist.
 */
export default defineEventHandler(async (event): Promise<TradeDetailResponse> => {
  await requireUser(event)
  const { id } = await getValidatedRouterParams(event, tradeIdParamsSchema.parse)
  const client = await serverSupabaseClient(event)

  // The account embeds through the composite foreign key. A manager can read every
  // account in an organisation they manage, so the embed is never empty for a visible
  // trade.
  const { data: trade, error } = await client
    .from('trades')
    .select('*, account:accounts(name, currency)')
    .eq('id', id)
    .maybeSingle()

  if (error) throw mapDatabaseError(error)
  if (!trade) throw notFound({ message: 'Trade not found' })

  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('display_name')
    .eq('id', trade.user_id)
    .maybeSingle()

  if (profileError) throw mapDatabaseError(profileError)

  return { ...withTradeStats(trade), trader_name: profile?.display_name ?? null }
})
