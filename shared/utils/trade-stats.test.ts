import { describe, expect, it } from 'vitest'
import {
  realisedPnl,
  rMultiple,
  roundTo,
  tradeOutcome,
  tradeStats,
  type TradeForStats,
} from './trade-stats'

// A closed long of 10 shares from 100 to 110 with no fees and a stop at 95: +100, +2R.
// Each test overrides only what it is about.
function trade(overrides: Partial<TradeForStats> = {}): TradeForStats {
  return {
    side: 'long',
    status: 'closed',
    quantity: 10,
    entry_price: 100,
    exit_price: 110,
    stop_price: 95,
    fees: 0,
    ...overrides,
  }
}

// An open trade has no exit, exactly as the trades_exit_matches_status check requires.
function openTrade(overrides: Partial<TradeForStats> = {}): TradeForStats {
  return trade({ status: 'open', exit_price: null, ...overrides })
}

describe('roundTo', () => {
  it('rounds a true half up, even though 1.005 * 100 is 100.49999999999999 in floats', () => {
    expect(roundTo(1.005, 2)).toBe(1.01)
  })

  it('removes float noise', () => {
    expect(roundTo(0.1 + 0.2, 2)).toBe(0.3)
  })

  it('rounds a negative half away from zero', () => {
    expect(roundTo(-1.005, 2)).toBe(-1.01)
  })

  it('never returns negative zero', () => {
    expect(roundTo(-0.001, 2)).toBe(0)
  })
})

describe('realisedPnl', () => {
  it('is the price move times quantity for a long, less fees', () => {
    expect(realisedPnl(trade({ fees: 2 }))).toBe(98)
  })

  it('profits from a fall on a short', () => {
    expect(realisedPnl(trade({ side: 'short', exit_price: 90, fees: 2 }))).toBe(98)
  })

  it('loses on a short when the price rises', () => {
    expect(realisedPnl(trade({ side: 'short', exit_price: 105 }))).toBe(-50)
  })

  it('lets fees turn a winning price move into a loss', () => {
    const scratch = trade({ exit_price: 100.1, fees: 1.5 })
    expect(realisedPnl(scratch)).toBe(-0.5)
    expect(tradeOutcome(scratch)).toBe('loss')
  })

  it('is null for an open trade', () => {
    expect(realisedPnl(openTrade())).toBeNull()
  })

  it('is exact to the cent where raw float arithmetic is not', () => {
    // (0.3 - 0.1) * 1 is 0.19999999999999998 in floats.
    expect(
      realisedPnl(
        trade({ quantity: 1, entry_price: 0.1, exit_price: 0.3, stop_price: null }),
      ),
    ).toBe(0.2)
  })

  it('handles fractional crypto quantities', () => {
    expect(
      realisedPnl(
        trade({
          quantity: 0.00012345,
          entry_price: 60000,
          exit_price: 61000,
          stop_price: null,
        }),
      ),
    ).toBe(0.12)
  })
})

describe('tradeOutcome', () => {
  it('is breakeven when the exit equals the entry and there are no fees', () => {
    expect(tradeOutcome(trade({ exit_price: 100 }))).toBe('breakeven')
  })

  it('is breakeven when the result rounds to less than half a cent', () => {
    expect(tradeOutcome(trade({ quantity: 1, exit_price: 100.004 }))).toBe('breakeven')
  })

  it('is null for an open trade', () => {
    expect(tradeOutcome(openTrade())).toBeNull()
  })
})

describe('rMultiple', () => {
  it('is P&L over the initial risk for a long', () => {
    expect(rMultiple(trade())).toBe(2)
  })

  it('measures risk upwards from the entry for a short', () => {
    expect(rMultiple(trade({ side: 'short', stop_price: 105, exit_price: 90 }))).toBe(2)
  })

  it('is negative for a loss, and -1 when stopped out exactly', () => {
    expect(rMultiple(trade({ exit_price: 95 }))).toBe(-1)
  })

  it('uses P&L after fees, so it agrees with the win or loss', () => {
    expect(rMultiple(trade({ fees: 10 }))).toBe(1.8)
  })

  it('is null without a stop', () => {
    expect(rMultiple(trade({ stop_price: null }))).toBeNull()
  })

  it('is null when the stop equals the entry, rather than dividing by zero', () => {
    expect(rMultiple(trade({ stop_price: 100 }))).toBeNull()
  })

  it('is null when the stop is on the profit side of the entry', () => {
    expect(rMultiple(trade({ stop_price: 101 }))).toBeNull()
    expect(rMultiple(trade({ side: 'short', stop_price: 99, exit_price: 90 }))).toBeNull()
  })

  it('is null for an open trade', () => {
    expect(rMultiple(openTrade())).toBeNull()
  })
})

describe('tradeStats', () => {
  it('has no win rate or average R for zero trades', () => {
    expect(tradeStats([])).toEqual({
      openCount: 0,
      closedCount: 0,
      wins: 0,
      losses: 0,
      breakevens: 0,
      winRate: null,
      totalPnl: 0,
      averageR: null,
    })
  })

  it('excludes open trades and breakevens from the win rate', () => {
    const stats = tradeStats([
      trade(),
      trade({ exit_price: 105 }),
      trade({ exit_price: 95 }),
      trade({ exit_price: 100 }),
      openTrade(),
    ])
    expect(stats).toMatchObject({
      openCount: 1,
      closedCount: 4,
      wins: 2,
      losses: 1,
      breakevens: 1,
    })
    expect(stats.winRate).toBeCloseTo(2 / 3)
  })

  it('has no win rate while every trade is still open', () => {
    expect(tradeStats([openTrade(), openTrade()]).winRate).toBeNull()
  })

  it('has no win rate when every closed trade is breakeven', () => {
    expect(tradeStats([trade({ exit_price: 100 })]).winRate).toBeNull()
  })

  it('totals P&L over closed trades only', () => {
    expect(
      tradeStats([trade(), trade({ side: 'short', exit_price: 105 }), openTrade()])
        .totalPnl,
    ).toBe(50)
  })

  it('totals without float drift', () => {
    // Ten 0.1 profits sum to 0.9999999999999999 in floats.
    const dimes = Array.from({ length: 10 }, () =>
      trade({ quantity: 1, exit_price: 100.1 }),
    )
    expect(tradeStats(dimes).totalPnl).toBe(1)
  })

  it('averages R only over trades that have a stop', () => {
    const stats = tradeStats([
      trade(),
      trade({ exit_price: 95 }),
      trade({ stop_price: null }),
    ])
    expect(stats.averageR).toBe(0.5)
  })
})
