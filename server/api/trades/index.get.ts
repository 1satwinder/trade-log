import { serverSupabaseClient } from '#supabase/server'
import type { TradeResponse } from '#shared/types/trade'
import { withTradeStats } from '#shared/utils/trade-stats'

import { mapDatabaseError } from '../../utils/errors'
import { requireUser } from '../../utils/require-user'

/**
 * Every trade the caller may see, newest entry first, each with its trader's name.
 *
 * There is no user or org filter here on purpose: the trades select policy decides. A
 * member gets their own trades, and an owner or admin also gets every trade in the
 * organisations they manage.
 */
export default defineEventHandler(async (event): Promise<TradeResponse[]> => {
  await requireUser(event)
  const client = await serverSupabaseClient(event)

  const { data: trades, error } = await client
    .from('trades')
    .select('*')
    .order('entry_at', { ascending: false })

  if (error) throw mapDatabaseError(error)

  // trades.user_id references auth.users, not profiles, so PostgREST cannot embed the
  // profile. A second query by id is one round trip, and the profiles policy lets the
  // caller read every fellow member whose trades they can see.
  const userIds = [...new Set(trades.map((trade) => trade.user_id))]
  const { data: profiles, error: profilesError } = await client
    .from('profiles')
    .select('id, display_name')
    .in('id', userIds)

  if (profilesError) throw mapDatabaseError(profilesError)

  const nameById = new Map(profiles.map((profile) => [profile.id, profile.display_name]))

  return trades.map((trade) => ({
    ...withTradeStats(trade),
    trader_name: nameById.get(trade.user_id) ?? null,
  }))
})
