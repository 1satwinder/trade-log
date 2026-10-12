import { z } from 'zod'

import type { tradeCreateSchema, tradeUpdateSchema } from '#shared/schemas/trade'
import { Constants, type Tables } from '#shared/types/database.types'
import type { TradeSide, TradeStatus } from '#shared/utils/trade-stats'

// The trade form holds every field as a string, as an HTML form does. A number input
// bound to a number re-renders "1.0" as "1" mid-keystroke, so typing 1.05 is impossible.
// Strings are validated by tradeFormSchema and converted once, by the functions below,
// into the request bodies that shared/schemas/trade.ts validates again on the server.

export interface TradeFormState {
  account_id: string
  symbol: string
  side: TradeSide
  status: TradeStatus
  quantity: string
  entry_price: string
  stop_price: string
  // `datetime-local` values: YYYY-MM-DDTHH:mm in the browser's timezone, no offset.
  entry_at: string
  exit_price: string
  exit_at: string
  fees: string
  thesis: string
}

export type TradeCreateBody = z.input<typeof tradeCreateSchema>
export type TradeUpdateBody = z.input<typeof tradeUpdateSchema>

const decimalPattern = /^(\d+\.?\d*|\.\d+)$/

// Whether a field holds a plain decimal above zero. Exponents and signs are refused.
function isPositiveDecimal(value: string): boolean {
  return decimalPattern.test(value) && Number(value) > 0
}

// Whether a datetime-local value parses. An empty string does not.
function isDateTimeLocal(value: string): boolean {
  return !Number.isNaN(Date.parse(value))
}

// Client-side rules, for field-level messages before a request is sent. Upper bounds and
// the database's check constraints are left to the server, which answers 400 or 422.
export const tradeFormSchema = z
  .object({
    account_id: z.string().min(1, 'Choose an account'),
    symbol: z.string().trim().min(1, 'Enter a symbol').max(20, 'At most 20 characters'),
    side: z.enum(Constants.public.Enums.trade_side),
    status: z.enum(Constants.public.Enums.trade_status),
    quantity: z.string().trim().refine(isPositiveDecimal, 'Enter a quantity above zero'),
    entry_price: z.string().trim().refine(isPositiveDecimal, 'Enter a price above zero'),
    stop_price: z
      .string()
      .trim()
      .refine((v) => v === '' || isPositiveDecimal(v), 'Enter a price above zero'),
    entry_at: z.string().refine(isDateTimeLocal, 'Enter the entry time'),
    exit_price: z.string().trim(),
    exit_at: z.string(),
    fees: z
      .string()
      .trim()
      .refine((v) => v === '' || decimalPattern.test(v), 'Enter fees as a number, or 0'),
    thesis: z.string().max(5000, 'At most 5000 characters'),
  })
  .superRefine((form, ctx) => {
    if (form.status !== 'closed') return
    if (!isPositiveDecimal(form.exit_price)) {
      ctx.addIssue({
        code: 'custom',
        path: ['exit_price'],
        message: 'Enter the exit price',
      })
    }
    if (!isDateTimeLocal(form.exit_at)) {
      ctx.addIssue({ code: 'custom', path: ['exit_at'], message: 'Enter the exit time' })
    } else if (
      isDateTimeLocal(form.entry_at) &&
      Date.parse(form.exit_at) < Date.parse(form.entry_at)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['exit_at'],
        message: 'Exit time must be at or after entry time',
      })
    }
  })

// Formats a Date, or an ISO timestamp, as a datetime-local value in the browser's
// timezone. Seconds are dropped, because the input only shows minutes.
export function toDateTimeLocal(value: Date | string): string {
  const date = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

// Reads a datetime-local value as local time and returns it as a UTC ISO timestamp. A
// date-time string without an offset is local time by the ECMAScript spec.
export function fromDateTimeLocal(value: string): string {
  return new Date(value).toISOString()
}

// A number as a plain decimal string for an input. String(0.00000001) is "1e-8", which
// the form's decimal pattern refuses; numeric(20, 8) never holds more than 8 decimals.
function toDecimalString(value: number): string {
  return value.toFixed(8).replace(/\.?0+$/, '')
}

// A blank form, logging into the given account. The entry time is filled in on the
// client, since the server does not know the browser's timezone.
export function emptyTradeForm(accountId: string): TradeFormState {
  return {
    account_id: accountId,
    symbol: '',
    side: 'long',
    status: 'open',
    quantity: '',
    entry_price: '',
    stop_price: '',
    entry_at: '',
    exit_price: '',
    exit_at: '',
    fees: '',
    thesis: '',
  }
}

// The form's starting values for editing an existing trade.
export function tradeFormFromTrade(trade: Tables<'trades'>): TradeFormState {
  return {
    account_id: trade.account_id,
    symbol: trade.symbol,
    side: trade.side,
    status: trade.status,
    quantity: toDecimalString(trade.quantity),
    entry_price: toDecimalString(trade.entry_price),
    stop_price: trade.stop_price === null ? '' : toDecimalString(trade.stop_price),
    entry_at: toDateTimeLocal(trade.entry_at),
    exit_price: trade.exit_price === null ? '' : toDecimalString(trade.exit_price),
    exit_at: trade.exit_at === null ? '' : toDateTimeLocal(trade.exit_at),
    fees: toDecimalString(trade.fees),
    thesis: trade.thesis ?? '',
  }
}

// The editable fields of a validated form, converted to request-body values. Exit fields
// are null unless the trade is closed.
function toBodyFields(form: TradeFormState) {
  const closed = form.status === 'closed'
  return {
    symbol: form.symbol.trim().toUpperCase(),
    side: form.side,
    status: form.status,
    quantity: Number(form.quantity),
    entry_price: Number(form.entry_price),
    stop_price: form.stop_price.trim() === '' ? null : Number(form.stop_price),
    entry_at: fromDateTimeLocal(form.entry_at),
    exit_price: closed ? Number(form.exit_price) : null,
    exit_at: closed ? fromDateTimeLocal(form.exit_at) : null,
    fees: form.fees.trim() === '' ? 0 : Number(form.fees),
    thesis: form.thesis.trim() === '' ? null : form.thesis.trim(),
  }
}

// The POST /api/trades body for a validated form.
export function toTradeCreateBody(form: TradeFormState): TradeCreateBody {
  const { exit_price, exit_at, status, ...fields } = toBodyFields(form)
  const base = { ...fields, account_id: form.account_id }
  if (status === 'closed' && exit_price !== null && exit_at !== null) {
    return { ...base, status, exit_price, exit_at }
  }
  return { ...base, status: 'open' }
}

// The PATCH /api/trades/:id body: only the fields that changed. Sending everything would
// rewrite entry_at and exit_at with their seconds dropped by the minute-only input, so
// an untouched time must stay out of the request. Closing a trade always carries its
// exit, which the update schema requires in the same request.
export function toTradeUpdateBody(
  initial: TradeFormState,
  current: TradeFormState,
): TradeUpdateBody {
  const before = toBodyFields(initial)
  const after = toBodyFields(current)
  const body: Partial<typeof after> = {}

  for (const key of Object.keys(after) as (keyof typeof after)[]) {
    if (after[key] !== before[key]) Object.assign(body, { [key]: after[key] })
  }

  if (body.status === 'closed') {
    body.exit_price = after.exit_price
    body.exit_at = after.exit_at
  }

  return body
}
