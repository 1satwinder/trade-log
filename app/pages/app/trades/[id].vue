<script setup lang="ts">
const route = useRoute()
const toast = useToast()
const { userId } = useAuth()

const id = String(route.params.id)

const { data: trade, error } = await useFetch(`/api/trades/${id}`)

// A trade RLS hides answers 404, the same as one that does not exist, and a malformed id
// in the URL is just as missing. Throwing renders the error page with that status, on the
// server as well as after client navigation.
if (error.value || !trade.value) {
  const statusCode = error.value?.statusCode ?? 404
  throw createError(
    statusCode === 400 || statusCode === 404
      ? {
          statusCode: 404,
          statusMessage: 'Not Found',
          message: 'Trade not found',
          fatal: true,
        }
      : { statusCode, statusMessage: error.value?.statusMessage, fatal: true },
  )
}

useHead({ title: () => `${trade.value?.symbol ?? 'Trade'} · Tradelog` })

// Managers can read a member's trade but not change it; the update and delete policies
// would answer 404. Hiding the buttons is only courtesy.
const isMine = computed(() => trade.value?.user_id === userId.value)

const editing = ref(false)
const saving = ref(false)
const confirmingDelete = ref(false)
const deleting = ref(false)
const errorMessage = ref<string | null>(null)

// The form's starting values, built in the browser when editing begins, so that times
// are shown in the browser's timezone.
const initialForm = computed(() => (trade.value ? tradeFormFromTrade(trade.value) : null))

// Sends only the changed fields, then merges the updated row into the page.
async function onSave(form: TradeFormState) {
  if (!trade.value || !initialForm.value) return
  const body = toTradeUpdateBody(initialForm.value, form)
  if (Object.keys(body).length === 0) {
    editing.value = false
    return
  }

  saving.value = true
  errorMessage.value = null
  try {
    const updated = await $fetch(`/api/trades/${id}`, { method: 'PATCH', body })
    trade.value = { ...trade.value, ...updated }
    editing.value = false
    toast.add({ title: 'Trade saved', color: 'success' })
  } catch (fetchError) {
    errorMessage.value = fetchErrorMessage(fetchError, 'The trade could not be saved.')
  } finally {
    saving.value = false
  }
}

// Deletes the trade and returns to the list.
async function onDelete() {
  deleting.value = true
  errorMessage.value = null
  try {
    await $fetch(`/api/trades/${id}`, { method: 'DELETE' })
    toast.add({ title: 'Trade deleted', color: 'success' })
    await navigateTo('/app/trades')
  } catch (fetchError) {
    confirmingDelete.value = false
    errorMessage.value = fetchErrorMessage(fetchError, 'The trade could not be deleted.')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <section v-if="trade" class="max-w-3xl space-y-6">
    <ULink to="/app/trades" class="text-sm text-muted">← All trades</ULink>

    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <h1 class="text-2xl font-semibold">{{ trade.symbol }}</h1>
        <UBadge
          :label="trade.side"
          :color="trade.side === 'long' ? 'info' : 'warning'"
          variant="subtle"
        />
        <UBadge
          :label="trade.status"
          :color="trade.status === 'open' ? 'primary' : 'neutral'"
          variant="outline"
        />
      </div>

      <div v-if="isMine && !editing" class="flex gap-2">
        <UButton color="neutral" variant="outline" label="Edit" @click="editing = true" />
        <UModal
          v-model:open="confirmingDelete"
          title="Delete this trade?"
          description="This cannot be undone."
        >
          <UButton color="error" variant="outline" label="Delete" />
          <template #footer>
            <UButton
              color="neutral"
              variant="ghost"
              label="Cancel"
              @click="confirmingDelete = false"
            />
            <UButton
              color="error"
              label="Delete trade"
              :loading="deleting"
              @click="onDelete"
            />
          </template>
        </UModal>
      </div>
    </div>

    <UAlert
      v-if="!isMine"
      color="neutral"
      variant="subtle"
      :title="`Logged by ${trade.trader_name ?? 'a teammate'}`"
      description="You can see this trade because you manage their organisation. Only they can change it."
    />

    <UAlert v-if="errorMessage" color="error" variant="subtle" :title="errorMessage" />

    <TradesForm
      v-if="editing && initialForm"
      :initial="initialForm"
      submit-label="Save changes"
      :pending="saving"
      @submit="onSave"
      @cancel="editing = false"
    />
    <TradesDetails v-else :trade="trade" />
  </section>
</template>
