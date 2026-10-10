import { serverSupabaseClient } from '#supabase/server'

import { mapDatabaseError } from '../../utils/errors'
import { requireUser } from '../../utils/require-user'

/**
 * The caller's own accounts, for the account picker on the trade form.
 *
 * RLS would also return other members' accounts to an owner or admin. The user filter is
 * a product choice, not the security boundary: a trade can only be logged into your own
 * account, so only those are offered.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const client = await serverSupabaseClient(event)

  const { data, error } = await client
    .from('accounts')
    .select('id, name, currency, org_id, organization:organizations(name)')
    .eq('user_id', user.id)
    .order('created_at')

  if (error) throw mapDatabaseError(error)

  return data
})
