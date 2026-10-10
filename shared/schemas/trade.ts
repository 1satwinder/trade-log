import { z } from 'zod'

import { Constants } from '../types/database.types'

// Request bodies for the trades API. They mirror the check constraints on public.trades so
// bad input fails here with a field-level message; the constraints still have the final
// say. Objects are strict: a body carrying user_id or org_id is rejected rather than
// quietly stripped, because those always come from the session and the account.

// numeric(20, 8) holds values below 10^12.
const amount = z.number().positive().lt(1e12)
// numeric(16, 2).
const fees = z.number().min(0).lt(1e14)
const timestamp = z.iso.datetime({ offset: true })

const editableFields = {
  account_id: z.uuid(),
  symbol: z.string().trim().toUpperCase().min(1).max(20),
  side: z.enum(Constants.public.Enums.trade_side),
  quantity: amount,
  entry_price: amount,
  stop_price: amount.nullable().optional(),
  entry_at: timestamp,
  fees: fees.optional(),
  thesis: z.string().trim().max(5000).nullable().optional(),
}

const exitAfterEntry = {
  message: 'Exit time must be at or after entry time',
  path: ['exit_at'],
}

export const tradeCreateSchema = z
  .discriminatedUnion('status', [
    z.strictObject({ ...editableFields, status: z.literal('open') }),
    z.strictObject({
      ...editableFields,
      status: z.literal('closed'),
      exit_price: amount,
      exit_at: timestamp,
    }),
  ])
  .refine(
    (trade) =>
      trade.status === 'open' || Date.parse(trade.exit_at) >= Date.parse(trade.entry_at),
    exitAfterEntry,
  )

export type TradeCreate = z.output<typeof tradeCreateSchema>

// A partial update. Closing a trade needs its exit in the same request; reopening one
// clears the exit, since an open trade has none.
export const tradeUpdateSchema = z
  .strictObject({
    ...editableFields,
    status: z.enum(Constants.public.Enums.trade_status),
    exit_price: amount.nullable(),
    exit_at: timestamp.nullable(),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Nothing to update' })
  .refine(
    (patch) =>
      patch.status !== 'closed' || (patch.exit_price != null && patch.exit_at != null),
    { message: 'A closed trade needs an exit price and exit time', path: ['exit_price'] },
  )
  .refine(
    (patch) =>
      !patch.entry_at ||
      !patch.exit_at ||
      Date.parse(patch.exit_at) >= Date.parse(patch.entry_at),
    exitAfterEntry,
  )
  .transform((patch) =>
    patch.status === 'open' ? { ...patch, exit_price: null, exit_at: null } : patch,
  )

export type TradeUpdate = z.output<typeof tradeUpdateSchema>

export const tradeIdParamsSchema = z.strictObject({ id: z.uuid() })
