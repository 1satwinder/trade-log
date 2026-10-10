/**
 * Sign-in state and actions for the app, so pages never call the Supabase module directly
 * (ADR-0005). The user is the verified JWT claims, not a full Supabase User: `sub` is the
 * user id.
 *
 * Every action returns an error message to show, or null on success.
 */
export function useAuth() {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()
  const config = useRuntimeConfig()

  const isSignedIn = computed(() => user.value !== null)

  // The browser stores the PKCE code verifier in a cookie before the email is sent, so
  // the link only works in this browser, and only on the same host as siteUrl.
  async function sendMagicLink(email: string): Promise<string | null> {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${config.public.siteUrl}/confirm` },
    })
    return error?.message ?? null
  }

  // For the seeded demo users, who have passwords; real signups use the magic link.
  async function signInWithPassword(
    email: string,
    password: string,
  ): Promise<string | null> {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error?.message ?? null
  }

  // `local` revokes only this browser's session. The library default, `global`, would also
  // sign the user out on every other device.
  async function signOut(): Promise<string | null> {
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) return error.message
    await navigateTo('/login')
    return null
  }

  // Reports whether the magic link worked. The client plugin has already exchanged the
  // link's `?code=` for a session before any page runs, so this only reads the result.
  async function confirmSignIn(): Promise<string | null> {
    const { data, error } = await supabase.auth.getSession()
    if (error) return error.message
    if (!data.session) {
      return 'This sign-in link could not be used. Open it in the browser you requested it from, or request a new one.'
    }
    return null
  }

  // Where to go after signing in: the page the guard bounced the user from, else /app.
  function takeRedirectPath(): string {
    return useSupabaseCookieRedirect().pluck() || '/app'
  }

  return {
    user,
    isSignedIn,
    sendMagicLink,
    signInWithPassword,
    signOut,
    confirmSignIn,
    takeRedirectPath,
  }
}
