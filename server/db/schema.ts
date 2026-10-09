import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { authUsers } from 'drizzle-orm/supabase'

// Drizzle table definitions, used for DDL generation and types. Grants, row level security,
// policies, helper functions and triggers are hand-written SQL appended to the generated
// migration, so this file alone does not describe who can see what. See
// docs/data-model.md.
//
// Column names are written in camelCase and emitted as snake_case, because both
// drizzle.config.ts and the admin client set `casing: 'snake_case'`.

export const orgRole = pgEnum('org_role', ['owner', 'admin', 'member'])
export const tradeStatus = pgEnum('trade_status', ['open', 'closed'])
export const tradeSide = pgEnum('trade_side', ['long', 'short'])

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow()

// Money in the account currency: two decimals is exact for every currency we support.
const money = () => numeric({ precision: 16, scale: 2 })
// Prices and quantities: forex quotes need five decimals and crypto sizes need eight.
const decimal = () => numeric({ precision: 20, scale: 8 })

export const profiles = pgTable('profiles', {
  id: uuid()
    .primaryKey()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  displayName: text(),
  avatarUrl: text(),
  createdAt: createdAt(),
})

export const organizations = pgTable(
  'organizations',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    slug: text().notNull().unique(),
    createdAt: createdAt(),
  },
  (t) => [
    // Slugs appear in URLs from Phase 2, so they are restricted to lowercase kebab-case.
    check('organizations_slug_format', sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check('organizations_name_length', sql`char_length(${t.name}) between 1 and 100`),
  ],
)

export const memberships = pgTable(
  'memberships',
  {
    orgId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    role: orgRole().notNull().default('member'),
    createdAt: createdAt(),
  },
  (t) => [
    // The primary key's index leads with org_id, so it already serves "who is in this
    // org". The second index serves "which orgs am I in", which every policy asks.
    primaryKey({ columns: [t.orgId, t.userId] }),
    index('memberships_user_id_org_id_idx').on(t.userId, t.orgId),
  ],
)

export const accounts = pgTable(
  'accounts',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    currency: text().notNull().default('USD'),
    startingBalance: money().notNull().default('0'),
    createdAt: createdAt(),
  },
  (t) => [
    // Also the index behind the (org_id, user_id) visibility predicate.
    unique('accounts_org_id_user_id_name_key').on(t.orgId, t.userId, t.name),
    // Redundant as a uniqueness rule, since id is already unique, but a composite foreign
    // key can only target columns that are unique together. See trades below.
    unique('accounts_id_org_id_user_id_key').on(t.id, t.orgId, t.userId),
    index('accounts_user_id_idx').on(t.userId),
    check('accounts_name_length', sql`char_length(${t.name}) between 1 and 100`),
    check('accounts_currency_format', sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check('accounts_starting_balance_non_negative', sql`${t.startingBalance} >= 0`),
  ],
)

export const trades = pgTable(
  'trades',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: uuid().notNull(),
    accountId: uuid().notNull(),
    userId: uuid().notNull(),
    symbol: text().notNull(),
    side: tradeSide().notNull(),
    quantity: decimal().notNull(),
    entryPrice: decimal().notNull(),
    exitPrice: decimal(),
    // The initial risk. Without it an R multiple cannot be computed, so it stays optional.
    stopPrice: decimal(),
    entryAt: timestamp({ withTimezone: true }).notNull(),
    exitAt: timestamp({ withTimezone: true }),
    fees: money().notNull().default('0'),
    status: tradeStatus().notNull().default('open'),
    thesis: text(),
    createdAt: createdAt(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The only foreign key on trades. Matching all three columns means a trade's org and
    // owner must be its account's org and owner, which no policy then has to re-check. It
    // also carries the cascade from organizations and auth.users through accounts.
    foreignKey({
      name: 'trades_account_fkey',
      columns: [t.accountId, t.orgId, t.userId],
      foreignColumns: [accounts.id, accounts.orgId, accounts.userId],
    }).onDelete('cascade'),
    index('trades_org_id_user_id_idx').on(t.orgId, t.userId),
    index('trades_org_id_entry_at_idx').on(t.orgId, t.entryAt.desc()),
    index('trades_account_id_idx').on(t.accountId),
    check('trades_symbol_length', sql`char_length(${t.symbol}) between 1 and 20`),
    check('trades_quantity_positive', sql`${t.quantity} > 0`),
    check('trades_entry_price_positive', sql`${t.entryPrice} > 0`),
    check(
      'trades_exit_price_positive',
      sql`${t.exitPrice} is null or ${t.exitPrice} > 0`,
    ),
    check(
      'trades_stop_price_positive',
      sql`${t.stopPrice} is null or ${t.stopPrice} > 0`,
    ),
    check('trades_fees_non_negative', sql`${t.fees} >= 0`),
    // An open trade has no exit yet; a closed one must have both halves of it.
    check(
      'trades_exit_matches_status',
      sql`(${t.status} = 'open' and ${t.exitPrice} is null and ${t.exitAt} is null)
        or (${t.status} = 'closed' and ${t.exitPrice} is not null and ${t.exitAt} is not null)`,
    ),
    check(
      'trades_exit_after_entry',
      sql`${t.exitAt} is null or ${t.exitAt} >= ${t.entryAt}`,
    ),
  ],
)

export const tags = pgTable(
  'tags',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    color: text(),
    createdAt: createdAt(),
  },
  (t) => [
    // Leads with org_id, so it also serves every per-org tag lookup and the policies.
    unique('tags_org_id_name_key').on(t.orgId, t.name),
    check('tags_name_length', sql`char_length(${t.name}) between 1 and 40`),
    check('tags_color_format', sql`${t.color} is null or ${t.color} ~ '^#[0-9a-f]{6}$'`),
  ],
)

export const tradeTags = pgTable(
  'trade_tags',
  {
    tradeId: uuid()
      .notNull()
      .references(() => trades.id, { onDelete: 'cascade' }),
    tagId: uuid()
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [
    // The primary key serves lookups by trade; this serves "which trades carry this tag".
    primaryKey({ columns: [t.tradeId, t.tagId] }),
    index('trade_tags_tag_id_idx').on(t.tagId),
  ],
)
