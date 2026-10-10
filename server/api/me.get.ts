import { serverSupabaseClient } from '#supabase/server'

import { mapDatabaseError } from '../utils/errors'
import { requireUser } from '../utils/require-user'

/**
 * Who the caller is and which organisations they belong to.
 *
 * The /app page renders this on the server, which proves the session cookie reaches Nitro
 * and that PostgREST receives the user's JWT. Both reads go through RLS: the profile
 * policy shows the caller their own row, and the membership policy their own orgs.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const client = await serverSupabaseClient(event)

  const [profileResult, membershipsResult] = await Promise.all([
    client.from('profiles').select('display_name').eq('id', user.id).single(),
    client
      .from('memberships')
      .select('role, organization:organizations(id, name, slug)')
      .eq('user_id', user.id)
      .order('created_at'),
  ])

  if (profileResult.error) throw mapDatabaseError(profileResult.error)
  if (membershipsResult.error) throw mapDatabaseError(membershipsResult.error)

  return {
    id: user.id,
    email: user.email,
    displayName: profileResult.data.display_name,
    organizations: membershipsResult.data.map(({ role, organization }) => ({
      ...organization,
      role,
    })),
  }
})
