<script setup lang="ts">
// Rendered in the browser only (the module sets `ssr: false` on this route), because the
// PKCE code verifier is a browser cookie and the browser client does the code exchange.
useHead({ title: 'Signing in · Tradelog' })

const route = useRoute()
const { confirmSignIn, takeRedirectPath } = useAuth()

const errorMessage = ref<string | null>(null)

onMounted(async () => {
  // Supabase Auth redirects here with an error instead of a code when the link has
  // expired or was already used.
  const linkError = route.query.error_description
  errorMessage.value = typeof linkError === 'string' ? linkError : await confirmSignIn()

  if (!errorMessage.value) await navigateTo(takeRedirectPath(), { replace: true })
})
</script>

<template>
  <section class="mx-auto max-w-sm space-y-4">
    <template v-if="errorMessage">
      <h1 class="text-2xl font-semibold">Sign-in failed</h1>
      <UAlert color="error" variant="subtle" :title="errorMessage" />
      <UButton to="/login" variant="outline">Back to sign in</UButton>
    </template>
    <p v-else class="text-muted">Signing you in…</p>
  </section>
</template>
