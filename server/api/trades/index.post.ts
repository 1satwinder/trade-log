import { serverSupabaseClient } from '#supabase/server'
import { tradeCreateSchema } from '#shared/schemas/trade'
import { withTradeStats } from '#shared/utils/trade-stats'

import { mapDatabaseError, unprocessable } from '../../utils/errors'
import { requireUser } from '../../utils/require-user'

/**
 * Logs a trade into one of the caller's own accounts.
 *
 * The body names only the account. `org_id` is copied from that account and `user_id`
 * comes from the session, so neither can be chosen by the client. Managers can read other
 * members' accounts, so the lookup is limited to the caller's own; the composite foreign
 * key on (account_id, org_id, user_id) would reject the insert anyway.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readValidatedBody(event, tradeCreateSchema.parse)
  const client = await serverSupabaseClient(event)

  const { data: account, error: accountError } = await client
    .from('accounts')
    .select('id, org_id')
    .eq('id', body.account_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (accountError) throw mapDatabaseError(accountError)
  if (!account) throw unprocessable({ message: 'Account not found' })

  const { data, error } = await client
    .from('trades')
    .insert({ ...body, org_id: account.org_id, user_id: user.id })
    .select('*')
    .single()

  if (error) throw mapDatabaseError(error)

  setResponseStatus(event, 201)
  return withTradeStats(data)
})
