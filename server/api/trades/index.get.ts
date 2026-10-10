import { serverSupabaseClient } from '#supabase/server'
import { withTradeStats } from '#shared/utils/trade-stats'

import { mapDatabaseError } from '../../utils/errors'
import { requireUser } from '../../utils/require-user'

/**
 * Every trade the caller may see, newest entry first.
 *
 * There is no user or org filter here on purpose: the trades select policy decides. A
 * member gets their own trades, and an owner or admin also gets every trade in the
 * organisations they manage.
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const client = await serverSupabaseClient(event)

  const { data, error } = await client
    .from('trades')
    .select('*')
    .order('entry_at', { ascending: false })

  if (error) throw mapDatabaseError(error)

  return data.map(withTradeStats)
})
