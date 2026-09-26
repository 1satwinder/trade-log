// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // Nuxt UI brings Tailwind 4 and its Vite plugin with it, so there is no separate
  // Tailwind module here.
  modules: ['@nuxt/eslint', '@nuxt/ui', '@nuxtjs/supabase'],

  css: ['~/assets/css/main.css'],

  supabase: {
    // SSR sessions live in cookies, which is what makes serverSupabaseUser(event)
    // trustworthy on the server.
    useSsrCookies: true,
    // The module registers url, key and secretKey as runtimeConfig, so they are supplied
    // by NUXT_PUBLIC_SUPABASE_URL, NUXT_PUBLIC_SUPABASE_KEY and NUXT_SUPABASE_SECRET_KEY
    // at runtime rather than being inlined here at build time. Supabase's move to JWT
    // signing keys deprecated the older `serviceKey`; `secretKey` replaces it.
    //
    // Phase 1 adds /login and /confirm and turns the guard on. Until then the module
    // would redirect every route to a page that does not exist.
    redirect: false,
    // There is no schema yet, so there are no generated database types to point at.
    // Phase 1 lands the schema and switches this back to the generated file.
    types: false,
  },

  typescript: {
    strict: true,
    // Typechecking runs as its own script so dev startup stays fast.
    typeCheck: false,
  },

  eslint: {
    config: {
      // Prettier owns formatting; ESLint stays out of it.
      stylistic: false,
    },
  },

  // Every secret is declared here and read through useRuntimeConfig(event). Nothing in
  // app or server code touches process.env. Keys are overridden at runtime by the
  // matching NUXT_ environment variable listed in .env.example.
  // runtimeConfig values are resolved at process start That is exactly why one Docker image can be built once
  // and run in staging and production with different secrets
  runtimeConfig: {
    // !! Top-level keys are server-only. Only public reaches the browser.
    // Session-mode connection, used only by the Drizzle admin client.
    databaseUrl: '',
    // Direct connection on port 5432. Migrations only.
    directDatabaseUrl: '',

    stripeSecretKey: '',
    stripeWebhookSecret: '',
    stripePriceProMonthly: '',

    resendApiKey: '',
    emailFrom: '',

    marketDataApiKey: '',

    public: {
      siteUrl: 'http://localhost:3000', // sent to the browser as environment variable becuase its under public key
      stripePublishableKey: '',
    },
  },
})
