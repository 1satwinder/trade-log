// Number formatting for trade pages. The locale is fixed: the server render and the
// browser would otherwise pick different defaults, and the hydrated text would not match
// the HTML. Dates go through <NuxtTime> instead, which reformats them in the browser's
// own locale and timezone before hydration.

const LOCALE = 'en-US'

const decimalFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 8 })
const moneyFormat = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const signedFormat = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
})
const percentFormat = new Intl.NumberFormat(LOCALE, {
  style: 'percent',
  maximumFractionDigits: 1,
})

const MISSING = '—'

// A quantity or price, with as many decimals as it has, up to the column's 8.
export function formatDecimal(value: number | null): string {
  return value === null ? MISSING : decimalFormat.format(value)
}

// An unsigned amount in the account currency, such as fees.
export function formatMoney(value: number | null): string {
  return value === null ? MISSING : moneyFormat.format(value)
}

// A P&L amount in the account currency, signed.
export function formatPnl(value: number | null): string {
  return value === null ? MISSING : signedFormat.format(value)
}

// An R multiple, signed, such as +1.96R.
export function formatRMultiple(value: number | null): string {
  return value === null ? MISSING : `${signedFormat.format(value)}R`
}

// A ratio from 0 to 1 as a percentage.
export function formatPercent(ratio: number | null): string {
  return ratio === null ? MISSING : percentFormat.format(ratio)
}

// The text colour class for a signed amount.
export function pnlClass(value: number | null): string {
  if (value === null || value === 0) return 'text-muted'
  return value > 0 ? 'text-success' : 'text-error'
}
