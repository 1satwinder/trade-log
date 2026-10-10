import type { H3Event } from 'h3'

import { serverSupabaseUser } from '#supabase/server'

import { unauthorized } from './errors'

/** The signed-in user, as far as routes need to know. */
export interface AuthUser {
  id: string
  email: string | null
}

/**
 * Returns the signed-in user, or throws 401.
 *
 * serverSupabaseUser verifies the access token from the session cookie with getClaims().
 * The local stack and hosted projects sign with an asymmetric key, so that is a signature
 * check against cached public keys, not a call to Supabase Auth. A token therefore stays
 * valid after logout until it expires, the same window PostgREST allows (ADR-0013).
 *
 * The module throws a status-less error when the token is malformed, expired past refresh
 * or badly signed. To the caller all of those mean "not signed in".
 */
export async function requireUser(event: H3Event): Promise<AuthUser> {
  const claims = await serverSupabaseUser(event).catch((cause: unknown) => {
    throw unauthorized({ message: 'Sign in to continue', cause })
  })

  if (!claims?.sub) {
    throw unauthorized({ message: 'Sign in to continue' })
  }

  return { id: claims.sub, email: claims.email ?? null }
}
