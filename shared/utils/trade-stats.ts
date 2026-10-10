// Trade calculations shared by the app (stats strip) and the server (API responses). Pure
// functions only: no I/O, no framework, so Vitest can cover every edge case cheaply.
//
// Property names mirror the trades row, so a row from serverSupabaseClient can be passed
// straight in. PostgREST sends numeric columns as JSON numbers, which JSON.parse turns into
// binary floats; arithmetic happens in floats and is rounded once at the end.

export type TradeSide = 'long' | 'short'
export type TradeStatus = 'open' | 'closed'

export interface TradeForStats {
  side: TradeSide
  status: TradeStatus
  quantity: number
  entry_price: number
  exit_price: number | null
  stop_price: number | null
  // Total round-trip fees, in the account currency.
  fees: number
}

export type TradeOutcome = 'win' | 'loss' | 'breakeven'

export interface TradeStats {
  openCount: number
  closedCount: number
  wins: number
  losses: number
  breakevens: number
  // Wins over wins plus losses, from 0 to 1. Breakevens are left out of both, and it is
  // null until at least one closed trade has won or lost.
  winRate: number | null
  totalPnl: number
  // Mean R multiple over closed trades that have one; null when none do.
  averageR: number | null
}

// Rounds half away from zero. toPrecision(15) first discards the binary noise that float
// arithmetic adds, so that a true half such as 1.005 is not seen as 1.00499999... and
// rounded down. Fifteen significant digits stay exact up to about a trillion at two
// decimals, which no trade in this journal approaches.
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals
  const scaled = Number((Math.abs(value) * factor).toPrecision(15))
  const rounded = (Math.sign(value) * Math.round(scaled)) / factor
  // Math.sign keeps the sign of a negative that rounds to zero, which would display as -0.
  return rounded === 0 ? 0 : rounded
}

// +1 when the trade profits from a rise, -1 when it profits from a fall.
function directionOf(side: TradeSide): 1 | -1 {
  return side === 'long' ? 1 : -1
}

// Net realised P&L in the account currency, after fees, rounded to cents. Null while the
// trade is open, because unrealised P&L needs a live price.
export function realisedPnl(trade: TradeForStats): number | null {
  if (trade.status !== 'closed' || trade.exit_price === null) return null
  const gross =
    (trade.exit_price - trade.entry_price) * trade.quantity * directionOf(trade.side)
  return roundTo(gross - trade.fees, 2)
}

// Whether a closed trade made or lost money after fees. Null while it is open.
export function tradeOutcome(trade: TradeForStats): TradeOutcome | null {
  const pnl = realisedPnl(trade)
  if (pnl === null) return null
  if (pnl > 0) return 'win'
  if (pnl < 0) return 'loss'
  return 'breakeven'
}

// Net P&L as a multiple of the initial risk, rounded to two decimals. Null when the trade is
// open or has no stop, and when the stop is at or beyond the entry on the profit side, since
// the initial risk is then not a positive amount.
export function rMultiple(trade: TradeForStats): number | null {
  const pnl = realisedPnl(trade)
  if (pnl === null || trade.stop_price === null) return null
  const riskPerUnit = (trade.entry_price - trade.stop_price) * directionOf(trade.side)
  if (riskPerUnit <= 0) return null
  return roundTo(pnl / (riskPerUnit * trade.quantity), 2)
}

// The summary shown above the trade list.
export function tradeStats(trades: readonly TradeForStats[]): TradeStats {
  let openCount = 0
  let wins = 0
  let losses = 0
  let breakevens = 0
  let totalPnl = 0
  let rSum = 0
  let rCount = 0

  for (const trade of trades) {
    const outcome = tradeOutcome(trade)
    if (outcome === null) {
      openCount += 1
      continue
    }
    if (outcome === 'win') wins += 1
    else if (outcome === 'loss') losses += 1
    else breakevens += 1

    totalPnl += realisedPnl(trade) ?? 0

    const r = rMultiple(trade)
    if (r !== null) {
      rSum += r
      rCount += 1
    }
  }

  const decided = wins + losses
  return {
    openCount,
    closedCount: wins + losses + breakevens,
    wins,
    losses,
    breakevens,
    winRate: decided === 0 ? null : wins / decided,
    totalPnl: roundTo(totalPnl, 2),
    averageR: rCount === 0 ? null : roundTo(rSum / rCount, 2),
  }
}
