<script setup lang="ts">
import type { TradeDetailResponse } from '#shared/types/trade'

defineProps<{ trade: TradeDetailResponse }>()
</script>

<template>
  <div class="space-y-6">
    <dl class="grid gap-x-6 gap-y-4 sm:grid-cols-3">
      <div>
        <dt class="text-sm text-muted">Net P&amp;L</dt>
        <dd
          class="text-lg font-semibold tabular-nums"
          :class="pnlClass(trade.realised_pnl)"
        >
          {{ formatPnl(trade.realised_pnl) }}
          <span
            v-if="trade.account && trade.realised_pnl !== null"
            class="text-sm font-normal text-muted"
          >
            {{ trade.account.currency }}
          </span>
        </dd>
      </div>
      <div>
        <dt class="text-sm text-muted">R multiple</dt>
        <dd
          class="text-lg font-semibold tabular-nums"
          :class="pnlClass(trade.r_multiple)"
        >
          {{ formatRMultiple(trade.r_multiple) }}
        </dd>
      </div>
      <div>
        <dt class="text-sm text-muted">Account</dt>
        <dd>{{ trade.account?.name ?? '—' }}</dd>
      </div>

      <div>
        <dt class="text-sm text-muted">Quantity</dt>
        <dd class="tabular-nums">{{ formatDecimal(trade.quantity) }}</dd>
      </div>
      <div>
        <dt class="text-sm text-muted">Entry price</dt>
        <dd class="tabular-nums">{{ formatDecimal(trade.entry_price) }}</dd>
      </div>
      <div>
        <dt class="text-sm text-muted">Stop price</dt>
        <dd class="tabular-nums">{{ formatDecimal(trade.stop_price) }}</dd>
      </div>

      <div>
        <dt class="text-sm text-muted">Entry time</dt>
        <dd>
          <NuxtTime :datetime="trade.entry_at" date-style="medium" time-style="short" />
        </dd>
      </div>
      <div>
        <dt class="text-sm text-muted">Exit price</dt>
        <dd class="tabular-nums">{{ formatDecimal(trade.exit_price) }}</dd>
      </div>
      <div>
        <dt class="text-sm text-muted">Exit time</dt>
        <dd>
          <NuxtTime
            v-if="trade.exit_at"
            :datetime="trade.exit_at"
            date-style="medium"
            time-style="short"
          />
          <template v-else>—</template>
        </dd>
      </div>

      <div>
        <dt class="text-sm text-muted">Fees</dt>
        <dd class="tabular-nums">{{ formatMoney(trade.fees) }}</dd>
      </div>
      <div>
        <dt class="text-sm text-muted">Trader</dt>
        <dd>{{ trade.trader_name ?? '—' }}</dd>
      </div>
    </dl>

    <div>
      <h2 class="text-sm text-muted">Thesis</h2>
      <p class="whitespace-pre-line">{{ trade.thesis ?? 'No thesis written.' }}</p>
    </div>
  </div>
</template>
