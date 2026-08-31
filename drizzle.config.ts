import { defineConfig } from 'drizzle-kit'

// This file is loaded by the drizzle-kit CLI, outside Nitro, so useRuntimeConfig does not
// exist here. It is the one sanctioned place that reads process.env directly.
process.loadEnvFile?.('.env')

export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema.ts',
  out: './server/db/generated',
  // Drizzle only ever generates DDL. The Supabase CLI applies it, so that there is one
  // migration runner and one ordering. Generated SQL is moved to supabase/migrations/
  // and renamed to <timestamp>_<verb>_<subject>.sql by hand.
  dbCredentials: {
    // Direct connection on port 5432. Never the pooler — migrations need a real session.
    url: process.env.NUXT_DIRECT_DATABASE_URL ?? '',
  },
  casing: 'snake_case',
  strict: true,
  verbose: true,
})
