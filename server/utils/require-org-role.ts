import type { H3Event } from 'h3'

import { serverSupabaseClient } from '#supabase/server'

import type { Enums } from '#shared/types/database.types'

import { forbidden, mapDatabaseError, notFound } from './errors'
import { requireUser, type AuthUser } from './require-user'

export type OrgRole = Enums<'org_role'>

/**
 * Returns the signed-in user and their role in `orgId`, or throws.
 *
 * The membership is read through the user-scoped client, so RLS decides what is visible:
 * an organisation the caller does not belong to has no membership row they can see. That
 * answers 404 rather than 403, so the response does not confirm the organisation exists.
 * A member whose role is not in `roles` gets 403, because they can already see the org.
 *
 * `orgId` must already be validated as a uuid by the route.
 */
export async function requireOrgRole(
  event: H3Event,
  orgId: string,
  roles: readonly OrgRole[],
): Promise<{ user: AuthUser; role: OrgRole }> {
  const user = await requireUser(event)
  const client = await serverSupabaseClient(event)

  const { data, error } = await client
    .from('memberships')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) throw mapDatabaseError(error)
  if (!data) throw notFound({ message: 'Organisation not found' })
  if (!roles.includes(data.role)) {
    throw forbidden({ message: 'Your role in this organisation does not allow that' })
  }

  return { user, role: data.role }
}
