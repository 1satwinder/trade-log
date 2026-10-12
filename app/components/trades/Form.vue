<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'

const props = defineProps<{
  initial: TradeFormState
  // The account picker is only offered when creating; a trade cannot change account.
  accounts?: { label: string; value: string }[]
  submitLabel: string
  pending: boolean
}>()

const emit = defineEmits<{ submit: [form: TradeFormState]; cancel: [] }>()

const state = reactive<TradeFormState>({ ...props.initial })

const sideItems = [
  { label: 'Long', value: 'long' },
  { label: 'Short', value: 'short' },
]
const statusItems = [
  { label: 'Open', value: 'open' },
  { label: 'Closed', value: 'closed' },
]

// The server has no idea of the browser's timezone, so "now" is filled in after mount.
onMounted(() => {
  if (!state.entry_at) state.entry_at = toDateTimeLocal(new Date())
})

// Hands the validated form to the page, which owns the request.
function onSubmit(event: FormSubmitEvent<z.output<typeof tradeFormSchema>>) {
  emit('submit', event.data)
}
</script>

<template>
  <UForm :schema="tradeFormSchema" :state="state" class="space-y-6" @submit="onSubmit">
    <UFormField v-if="accounts" label="Account" name="account_id">
      <USelect v-model="state.account_id" :items="accounts" class="w-full" />
    </UFormField>

    <div class="grid gap-4 sm:grid-cols-3">
      <UFormField label="Symbol" name="symbol">
        <UInput v-model="state.symbol" placeholder="AAPL" class="w-full uppercase" />
      </UFormField>
      <UFormField label="Side" name="side">
        <URadioGroup v-model="state.side" :items="sideItems" orientation="horizontal" />
      </UFormField>
      <UFormField label="Status" name="status">
        <URadioGroup
          v-model="state.status"
          :items="statusItems"
          orientation="horizontal"
        />
      </UFormField>
    </div>

    <div class="grid gap-4 sm:grid-cols-3">
      <UFormField label="Quantity" name="quantity">
        <UInput v-model="state.quantity" inputmode="decimal" class="w-full" />
      </UFormField>
      <UFormField label="Entry price" name="entry_price">
        <UInput v-model="state.entry_price" inputmode="decimal" class="w-full" />
      </UFormField>
      <UFormField label="Stop price" name="stop_price" hint="Optional, for R">
        <UInput v-model="state.stop_price" inputmode="decimal" class="w-full" />
      </UFormField>
    </div>

    <div class="grid gap-4 sm:grid-cols-3">
      <UFormField label="Entry time" name="entry_at">
        <UInput v-model="state.entry_at" type="datetime-local" class="w-full" />
      </UFormField>
      <UFormField label="Fees" name="fees" hint="Round trip">
        <UInput v-model="state.fees" inputmode="decimal" placeholder="0" class="w-full" />
      </UFormField>
    </div>

    <div v-if="state.status === 'closed'" class="grid gap-4 sm:grid-cols-3">
      <UFormField label="Exit price" name="exit_price">
        <UInput v-model="state.exit_price" inputmode="decimal" class="w-full" />
      </UFormField>
      <UFormField label="Exit time" name="exit_at">
        <UInput v-model="state.exit_at" type="datetime-local" class="w-full" />
      </UFormField>
    </div>

    <UFormField label="Thesis" name="thesis" hint="Optional">
      <UTextarea v-model="state.thesis" :rows="4" autoresize class="w-full" />
    </UFormField>

    <div class="flex gap-2">
      <UButton type="submit" :loading="pending">{{ submitLabel }}</UButton>
      <UButton variant="ghost" color="neutral" @click="emit('cancel')">Cancel</UButton>
    </div>
  </UForm>
</template>
