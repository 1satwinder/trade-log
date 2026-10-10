import { describe, expect, it } from 'vitest'

import { tradeCreateSchema, tradeUpdateSchema } from './trade'

const openBody = {
  account_id: '5eed0000-0000-4000-8000-000000000001',
  symbol: ' aapl ',
  side: 'long',
  status: 'open',
  quantity: 10,
  entry_price: 100,
  entry_at: '2026-10-01T14:30:00Z',
}

const closedBody = {
  ...openBody,
  status: 'closed',
  exit_price: 110,
  exit_at: '2026-10-02T15:00:00Z',
}

describe('tradeCreateSchema', () => {
  it('accepts an open trade and normalises the symbol', () => {
    expect(tradeCreateSchema.parse(openBody).symbol).toBe('AAPL')
  })

  it('accepts a closed trade with its exit', () => {
    expect(tradeCreateSchema.safeParse(closedBody).success).toBe(true)
  })

  it('rejects user_id and org_id rather than stripping them', () => {
    expect(tradeCreateSchema.safeParse({ ...openBody, user_id: 'x' }).success).toBe(false)
    expect(tradeCreateSchema.safeParse({ ...openBody, org_id: 'x' }).success).toBe(false)
  })

  it('rejects an exit on an open trade', () => {
    expect(tradeCreateSchema.safeParse({ ...openBody, exit_price: 110 }).success).toBe(
      false,
    )
  })

  it('rejects a closed trade without its exit', () => {
    const { exit_at: _exitAt, ...missingExitAt } = closedBody
    expect(tradeCreateSchema.safeParse(missingExitAt).success).toBe(false)
  })

  it('rejects an exit before the entry', () => {
    const result = tradeCreateSchema.safeParse({
      ...closedBody,
      exit_at: '2026-09-30T00:00:00Z',
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['exit_at'])
  })

  it('rejects amounts that numeric(20, 8) cannot hold', () => {
    expect(tradeCreateSchema.safeParse({ ...openBody, quantity: 0 }).success).toBe(false)
    expect(tradeCreateSchema.safeParse({ ...openBody, entry_price: 1e12 }).success).toBe(
      false,
    )
  })
})

describe('tradeUpdateSchema', () => {
  it('rejects an empty patch', () => {
    expect(tradeUpdateSchema.safeParse({}).success).toBe(false)
  })

  it('requires the exit when closing', () => {
    expect(tradeUpdateSchema.safeParse({ status: 'closed' }).success).toBe(false)
    expect(
      tradeUpdateSchema.safeParse({
        status: 'closed',
        exit_price: 110,
        exit_at: '2026-10-02T15:00:00Z',
      }).success,
    ).toBe(true)
  })

  it('clears the exit when reopening', () => {
    expect(tradeUpdateSchema.parse({ status: 'open', exit_price: 110 })).toEqual({
      status: 'open',
      exit_price: null,
      exit_at: null,
    })
  })

  it('rejects user_id', () => {
    expect(tradeUpdateSchema.safeParse({ user_id: 'x' }).success).toBe(false)
  })
})
