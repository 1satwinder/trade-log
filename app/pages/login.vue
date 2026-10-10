<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'

useHead({ title: 'Sign in · Tradelog' })

const { isSignedIn, sendMagicLink, signInWithPassword, takeRedirectPath } = useAuth()

if (isSignedIn.value) {
  await navigateTo(takeRedirectPath(), { replace: true })
}

const magicLinkSchema = z.object({ email: z.email('Enter a valid email') })
const passwordSchema = z.object({
  email: z.email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
})

const magicLinkState = reactive({ email: '' })
const passwordState = reactive({ email: '', password: '' })

const sentTo = ref<string | null>(null)
const errorMessage = ref<string | null>(null)
const pending = ref(false)

// Submits the magic-link form. Signing in with an unknown email creates the account, and
// the signup trigger provisions its profile, organisation and account.
async function onMagicLink(event: FormSubmitEvent<z.output<typeof magicLinkSchema>>) {
  pending.value = true
  errorMessage.value = await sendMagicLink(event.data.email)
  pending.value = false
  if (!errorMessage.value) sentTo.value = event.data.email
}

// Submits the password form, then continues to where the user was heading.
async function onPassword(event: FormSubmitEvent<z.output<typeof passwordSchema>>) {
  pending.value = true
  errorMessage.value = await signInWithPassword(event.data.email, event.data.password)
  pending.value = false
  if (!errorMessage.value) await navigateTo(takeRedirectPath(), { replace: true })
}
</script>

<template>
  <section class="mx-auto max-w-sm space-y-6">
    <h1 class="text-2xl font-semibold">Sign in</h1>

    <UAlert v-if="errorMessage" color="error" variant="subtle" :title="errorMessage" />

    <UAlert
      v-if="sentTo"
      color="success"
      variant="subtle"
      title="Check your email"
      :description="`We sent a sign-in link to ${sentTo}. Open it in this browser.`"
    />

    <UForm
      v-else
      :schema="magicLinkSchema"
      :state="magicLinkState"
      class="space-y-4"
      @submit="onMagicLink"
    >
      <UFormField label="Email" name="email">
        <UInput
          v-model="magicLinkState.email"
          type="email"
          autocomplete="email"
          class="w-full"
        />
      </UFormField>
      <UButton type="submit" block :loading="pending">Email me a sign-in link</UButton>
    </UForm>

    <USeparator label="or, for the demo users" />

    <UForm
      :schema="passwordSchema"
      :state="passwordState"
      class="space-y-4"
      @submit="onPassword"
    >
      <UFormField label="Email" name="email">
        <UInput
          v-model="passwordState.email"
          type="email"
          autocomplete="username"
          class="w-full"
        />
      </UFormField>
      <UFormField label="Password" name="password">
        <UInput
          v-model="passwordState.password"
          type="password"
          autocomplete="current-password"
          class="w-full"
        />
      </UFormField>
      <UButton type="submit" block variant="outline" :loading="pending">
        Sign in with password
      </UButton>
    </UForm>
  </section>
</template>
