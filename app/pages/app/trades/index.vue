<script setup lang="ts">
useHead({ title: 'Trades · Tradelog' })

const route = useRoute()
const { userId } = useAuth()

// Rendered on the server: useFetch forwards the browser's cookies to /api/trades, and the
// rows travel to the browser in the hydration payload, so there is no second request.
const { data: trades, error } = await useFetch('/api/trades', { default: () => [] })

// The filter lives in the query string, so the server renders the same view the browser
// shows, and the toggle is a plain link that works without JavaScript.
const onlyMine = computed(() => route.query.mine === '1')

const hasTeammates = computed(() =>
  trades.value.some((trade) => trade.user_id !== userId.value),
)

const visibleTrades = computed(() =>
  onlyMine.value
    ? trades.value.filter((trade) => trade.user_id === userId.value)
    : trades.value,
)

const stats = computed(() => tradeStats(visibleTrades.value))
</script>

<template>
  <section class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <h1 class="text-2xl font-semibold">Trades</h1>
      <div class="flex items-center gap-2">
        <UFieldGroup v-if="hasTeammates">
          <UButton
            to="/app/trades"
            color="neutral"
            :variant="onlyMine ? 'outline' : 'solid'"
            label="Everyone"
          />
          <UButton
            :to="{ path: '/app/trades', query: { mine: '1' } }"
            color="neutral"
            :variant="onlyMine ? 'solid' : 'outline'"
            label="Only mine"
          />
        </UFieldGroup>
        <UButton to="/app/trades/new" icon="i-lucide-plus" label="New trade" />
      </div>
    </div>

    <UAlert v-if="error" color="error" variant="subtle" :title="error.message" />

    <template v-else>
      <TradesStatsStrip :stats="stats" />
      <TradesTable :trades="visibleTrades" :show-trader="hasTeammates && !onlyMine" />
    </template>
  </section>
</template>
