import { describe, expect, it } from 'vitest'

import type { Tables } from '#shared/types/database.types'
import {
  emptyTradeForm,
  fromDateTimeLocal,
  toDateTimeLocal,
  toTradeCreateBody,
  toTradeUpdateBody,
  tradeFormFromTrade,
  tradeFormSchema,
  type TradeFormState,
} from './trade-form'

const ACCOUNT_ID = '7f1c4e2a-3b5d-4c6e-8f9a-0b1c2d3e4f5a'

// A valid open trade, as a user would type it.
function openForm(overrides: Partial<TradeFormState> = {}): TradeFormState {
  return {
    ...emptyTradeForm(ACCOUNT_ID),
    symbol: ' aapl ',
    quantity: '10',
    entry_price: '187.25',
    entry_at: '2026-10-05T14:30',
    ...overrides,
  }
}

// A closed trade row as the API returns it, with sub-minute precision on its times.
function tradeRow(overrides: Partial<Tables<'trades'>> = {}): Tables<'trades'> {
  return {
    id: '2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d',
    org_id: '3b4c5d6e-7f8a-4b9c-8d1e-2f3a4b5c6d7e',
    user_id: '4c5d6e7f-8a9b-4c0d-9e2f-3a4b5c6d7e8f',
    account_id: ACCOUNT_ID,
    symbol: 'MSFT',
    side: 'short',
    status: 'closed',
    quantity: 0.00000001,
    entry_price: 412.5,
    stop_price: 420,
    exit_price: 401,
    entry_at: '2026-10-01T13:45:17.123456+00:00',
    exit_at: '2026-10-02T15:10:42.5+00:00',
    fees: 0,
    thesis: null,
    created_at: '2026-10-01T13:45:17.123456+00:00',
    updated_at: '2026-10-02T15:10:42.5+00:00',
    ...overrides,
  }
}

describe('datetime-local conversion', () => {
  it('round-trips a minute-precision value in any timezone', () => {
    expect(toDateTimeLocal(fromDateTimeLocal('2026-10-05T14:30'))).toBe(
      '2026-10-05T14:30',
    )
  })

  it('drops seconds, which the input cannot show', () => {
    const local = toDateTimeLocal('2026-10-01T13:45:17.123Z')
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    expect(Date.parse(local)).toBe(Date.parse('2026-10-01T13:45:00Z'))
  })
})

describe('tradeFormSchema', () => {
  it('accepts a valid open trade', () => {
    expect(tradeFormSchema.safeParse(openForm()).success).toBe(true)
  })

  it.each(['', '0', '-5', '1e3', 'abc'])('refuses a quantity of %j', (quantity) => {
    expect(tradeFormSchema.safeParse(openForm({ quantity })).success).toBe(false)
  })

  it('accepts zero fees and a blank stop', () => {
    expect(
      tradeFormSchema.safeParse(openForm({ fees: '0', stop_price: '' })).success,
    ).toBe(true)
  })

  it('requires an exit price and time once the trade is closed', () => {
    const result = tradeFormSchema.safeParse(openForm({ status: 'closed' }))
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.path[0]).sort()).toEqual([
      'exit_at',
      'exit_price',
    ])
  })

  it('refuses an exit before the entry', () => {
    const form = openForm({
      status: 'closed',
      exit_price: '190',
      exit_at: '2026-10-05T14:29',
    })
    const result = tradeFormSchema.safeParse(form)
    expect(result.error?.issues[0]?.path).toEqual(['exit_at'])
  })
})

describe('toTradeCreateBody', () => {
  it('converts an open trade, defaulting fees to 0 and blanks to null', () => {
    expect(toTradeCreateBody(openForm())).toEqual({
      account_id: ACCOUNT_ID,
      symbol: 'AAPL',
      side: 'long',
      status: 'open',
      quantity: 10,
      entry_price: 187.25,
      stop_price: null,
      entry_at: fromDateTimeLocal('2026-10-05T14:30'),
      fees: 0,
      thesis: null,
    })
  })

  it('leaves out exit fields an open trade still has typed in', () => {
    const body = toTradeCreateBody(
      openForm({ exit_price: '190', exit_at: '2026-10-06T10:00' }),
    )
    expect(body).not.toHaveProperty('exit_price')
    expect(body).not.toHaveProperty('exit_at')
  })

  it('carries the exit of a closed trade', () => {
    const body = toTradeCreateBody(
      openForm({ status: 'closed', exit_price: '190.5', exit_at: '2026-10-06T10:00' }),
    )
    expect(body).toMatchObject({
      status: 'closed',
      exit_price: 190.5,
      exit_at: fromDateTimeLocal('2026-10-06T10:00'),
    })
  })
})

describe('tradeFormFromTrade', () => {
  it('writes tiny quantities as plain decimals the form accepts', () => {
    const form = tradeFormFromTrade(tradeRow())
    expect(form.quantity).toBe('0.00000001')
    expect(form.fees).toBe('0')
    expect(tradeFormSchema.safeParse(form).success).toBe(true)
  })
})

describe('toTradeUpdateBody', () => {
  it('sends nothing when nothing changed, despite the dropped seconds', () => {
    const initial = tradeFormFromTrade(tradeRow())
    expect(toTradeUpdateBody(initial, { ...initial })).toEqual({})
  })

  it('sends only the edited field', () => {
    const initial = tradeFormFromTrade(tradeRow())
    expect(toTradeUpdateBody(initial, { ...initial, thesis: 'Faded the gap' })).toEqual({
      thesis: 'Faded the gap',
    })
  })

  it('sends the exit with the status when a trade is closed', () => {
    const initial = tradeFormFromTrade(
      tradeRow({ status: 'open', exit_price: null, exit_at: null }),
    )
    const current = {
      ...initial,
      status: 'closed' as const,
      exit_price: '401',
      exit_at: '2026-10-02T15:10',
    }
    expect(toTradeUpdateBody(initial, current)).toEqual({
      status: 'closed',
      exit_price: 401,
      exit_at: fromDateTimeLocal('2026-10-02T15:10'),
    })
  })

  it('clears the exit when a trade is reopened', () => {
    const initial = tradeFormFromTrade(tradeRow())
    expect(toTradeUpdateBody(initial, { ...initial, status: 'open' })).toEqual({
      status: 'open',
      exit_price: null,
      exit_at: null,
    })
  })
})
