<script setup lang="ts">
useHead({ title: 'Your journal · Tradelog' })

// Fetched during the server render: Nuxt forwards the browser's cookies to /api/me, so
// the HTML already contains the user's own data.
const { data: me, error } = await useFetch('/api/me')
</script>

<template>
  <section class="space-y-6">
    <UAlert v-if="error" color="error" variant="subtle" :title="error.message" />

    <template v-else-if="me">
      <div class="space-y-1">
        <h1 class="text-2xl font-semibold">
          Signed in as {{ me.displayName ?? me.email }}
        </h1>
        <p class="text-muted">{{ me.email }}</p>
      </div>

      <UButton to="/app/trades" label="Open your trades" />

      <div class="space-y-2">
        <h2 class="font-medium">Your organisations</h2>
        <ul class="divide-y divide-default rounded-md border border-default">
          <li
            v-for="org in me.organizations"
            :key="org.id"
            class="flex items-center justify-between px-4 py-3"
          >
            <span>{{ org.name }}</span>
            <UBadge :label="org.role" variant="subtle" />
          </li>
        </ul>
      </div>
    </template>
  </section>
</template>
