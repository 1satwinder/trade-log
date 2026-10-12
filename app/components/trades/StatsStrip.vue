<script setup lang="ts">
import type { TradeStats } from '#shared/utils/trade-stats'

defineProps<{ stats: TradeStats }>()
</script>

<template>
  <dl
    class="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-default bg-(--ui-border) sm:grid-cols-4"
  >
    <div class="bg-default px-4 py-3">
      <dt class="text-sm text-muted">Net P&amp;L</dt>
      <dd class="text-xl font-semibold tabular-nums" :class="pnlClass(stats.totalPnl)">
        {{ formatPnl(stats.totalPnl) }}
      </dd>
    </div>
    <div class="bg-default px-4 py-3">
      <dt class="text-sm text-muted">Win rate</dt>
      <dd class="text-xl font-semibold tabular-nums">
        {{ formatPercent(stats.winRate) }}
      </dd>
      <dd class="text-xs text-muted">
        {{ stats.wins }} won, {{ stats.losses }} lost, {{ stats.breakevens }} even
      </dd>
    </div>
    <div class="bg-default px-4 py-3">
      <dt class="text-sm text-muted">Average R</dt>
      <dd class="text-xl font-semibold tabular-nums" :class="pnlClass(stats.averageR)">
        {{ formatRMultiple(stats.averageR) }}
      </dd>
    </div>
    <div class="bg-default px-4 py-3">
      <dt class="text-sm text-muted">Trades</dt>
      <dd class="text-xl font-semibold tabular-nums">{{ stats.closedCount }} closed</dd>
      <dd class="text-xs text-muted">{{ stats.openCount }} open</dd>
    </div>
  </dl>
</template>
