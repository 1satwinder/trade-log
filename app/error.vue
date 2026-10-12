<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()

useHead({ title: `${props.error.statusCode} · Tradelog` })

const isNotFound = computed(() => props.error.statusCode === 404)
</script>

<template>
  <NuxtLayout>
    <section class="space-y-4">
      <p class="text-sm text-muted">{{ error.statusCode }}</p>
      <h1 class="text-2xl font-semibold">
        {{ isNotFound ? 'Not found' : 'Something went wrong' }}
      </h1>
      <p class="text-muted">
        {{
          isNotFound ? error.message || 'This page does not exist.' : 'Please try again.'
        }}
      </p>
      <UButton
        label="Back to your trades"
        @click="clearError({ redirect: '/app/trades' })"
      />
    </section>
  </NuxtLayout>
</template>
