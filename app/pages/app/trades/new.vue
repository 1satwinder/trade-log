<script setup lang="ts">
useHead({ title: 'New trade · Tradelog' })

const toast = useToast()

const { data: accounts, error: accountsError } = await useFetch('/api/accounts', {
  default: () => [],
})

const accountItems = computed(() =>
  accounts.value.map((account) => ({
    label: `${account.name} · ${account.organization.name}`,
    value: account.id,
  })),
)

const initial = emptyTradeForm(accounts.value[0]?.id ?? '')
const pending = ref(false)
const errorMessage = ref<string | null>(null)

// Creates the trade, then opens it. The server fills in org_id and user_id.
async function onSubmit(form: TradeFormState) {
  pending.value = true
  errorMessage.value = null
  try {
    const trade = await $fetch('/api/trades', {
      method: 'POST',
      body: toTradeCreateBody(form),
    })
    toast.add({ title: `${trade.symbol} logged`, color: 'success' })
    await navigateTo(`/app/trades/${trade.id}`)
  } catch (error) {
    errorMessage.value = fetchErrorMessage(error, 'The trade could not be saved.')
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <section class="max-w-3xl space-y-6">
    <h1 class="text-2xl font-semibold">New trade</h1>

    <UAlert
      v-if="accountsError || errorMessage"
      color="error"
      variant="subtle"
      :title="errorMessage ?? accountsError?.message"
    />

    <TradesForm
      v-if="accounts.length > 0"
      :initial="initial"
      :accounts="accountItems"
      submit-label="Log trade"
      :pending="pending"
      @submit="onSubmit"
      @cancel="navigateTo('/app/trades')"
    />
    <p v-else-if="!accountsError" class="text-muted">
      You have no account to log a trade into.
    </p>
  </section>
</template>
