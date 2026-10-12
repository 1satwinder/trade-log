import type { Tables } from './database.types'

// A trade as the trades API returns it: the row, the figures from withTradeStats, and the
// display name of the member who logged it. `trader_name` is null only if that member's
// profile is not visible, which the profiles policy should never allow to happen.
export type TradeResponse = Tables<'trades'> & {
  realised_pnl: number | null
  r_multiple: number | null
  trader_name: string | null
}

// The detail route also embeds the account the trade was logged into.
export type TradeDetailResponse = TradeResponse & {
  account: Pick<Tables<'accounts'>, 'name' | 'currency'> | null
}
