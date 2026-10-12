<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { TradeResponse } from '#shared/types/trade'

const props = defineProps<{
  trades: TradeResponse[]
  // Shown only when the list mixes several members' trades.
  showTrader: boolean
}>()

const numeric = { class: { th: 'text-right', td: 'text-right tabular-nums' } }

const columns = computed<TableColumn<TradeResponse>[]>(() => [
  { accessorKey: 'entry_at', header: 'Entry' },
  { accessorKey: 'symbol', header: 'Symbol' },
  { accessorKey: 'side', header: 'Side' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'quantity', header: 'Qty', meta: numeric },
  { accessorKey: 'entry_price', header: 'Entry price', meta: numeric },
  { accessorKey: 'exit_price', header: 'Exit price', meta: numeric },
  { accessorKey: 'realised_pnl', header: 'P&L', meta: numeric },
  { accessorKey: 'r_multiple', header: 'R', meta: numeric },
  ...(props.showTrader ? [{ accessorKey: 'trader_name', header: 'Trader' }] : []),
])
</script>

<template>
  <UTable :data="trades" :columns="columns" empty="No trades yet.">
    <template #entry_at-cell="{ row }">
      <NuxtTime
        :datetime="row.original.entry_at"
        date-style="medium"
        time-style="short"
      />
    </template>

    <!-- A real link, so the list works with JavaScript off and opens in a new tab. -->
    <template #symbol-cell="{ row }">
      <ULink :to="`/app/trades/${row.original.id}`" class="font-medium text-highlighted">
        {{ row.original.symbol }}
      </ULink>
    </template>

    <template #side-cell="{ row }">
      <UBadge
        :label="row.original.side"
        :color="row.original.side === 'long' ? 'info' : 'warning'"
        variant="subtle"
      />
    </template>

    <template #status-cell="{ row }">
      <UBadge
        :label="row.original.status"
        :color="row.original.status === 'open' ? 'primary' : 'neutral'"
        variant="outline"
      />
    </template>

    <template #quantity-cell="{ row }">{{
      formatDecimal(row.original.quantity)
    }}</template>
    <template #entry_price-cell="{ row }">
      {{ formatDecimal(row.original.entry_price) }}
    </template>
    <template #exit_price-cell="{ row }">
      {{ formatDecimal(row.original.exit_price) }}
    </template>

    <template #realised_pnl-cell="{ row }">
      <span :class="pnlClass(row.original.realised_pnl)">
        {{ formatPnl(row.original.realised_pnl) }}
      </span>
    </template>

    <template #r_multiple-cell="{ row }">
      <span :class="pnlClass(row.original.r_multiple)">
        {{ formatRMultiple(row.original.r_multiple) }}
      </span>
    </template>

    <template #trader_name-cell="{ row }">{{ row.original.trader_name ?? '—' }}</template>
  </UTable>
</template>
