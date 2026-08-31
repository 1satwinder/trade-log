# Learning log

The most valuable document in this repository for its stated purpose. Code shows what was
built; this shows what was understood.

Write an entry when something is learned, something breaks, or something turns out to work
differently than expected. Especially when it breaks — "I hit X, the cause was Y, the fix
was Z" is exactly what an interviewer is probing for, and it is impossible to reconstruct
six weeks later.

Keep entries short. Newest first.

## How to write an entry

```
### YYYY-MM-DD — Short title
**Concept**: what this is really about
**What happened**: the observation or symptom
**Why**: the actual mechanism, not the workaround
**Takeaway**: what would be done differently, or the rule now followed
```

## Questions to be able to answer out loud by the end

Treat this as the interview-prep target. When a question can be answered without
hesitation, note the entry that earned it.

**Rendering and Nuxt**

- What actually differs between SSR, SSG and ISR, and how does a route rule choose?
- What runs on the server versus the client during hydration, and how do you avoid a
  mismatch?
- Where does Nitro end and Nuxt begin?

**Auth**

- How does a Supabase session survive a full page load in SSR? Which cookies, set by whom?
- Why is `serverSupabaseUser` trustworthy and `serverSupabaseSession` not?
- Why is a module-level server client a security bug?
- What would you have to write yourself if `@nuxtjs/supabase` did not exist?

**Postgres and authorisation**

- What does `security definer` do, and why does a multi-tenant policy need it?
- Why does `(select auth.uid())` perform so differently from `auth.uid()`?
- Why does a `select` policy alone not prevent cross-tenant inserts?
- How does an ORM bypass RLS, and what would it take to make it comply?
- How would you prove tenant isolation to someone who does not trust you?

**Operations**

- Where do scheduled tasks actually run on your platform, and what happens on redeploy?
- Why does a transaction pooler break prepared statements?
- What breaks first if the app scales to two instances?
- What is the recovery story if the production database is lost?

**Billing**

- Why must a webhook handler be idempotent, and how is that achieved here?
- Why is the raw body needed for signature verification?

## Entries

### 2026-08-31 — "Never create a client at module scope" is about sessions, not connections

**Concept**: what the rule in [AGENTS.md](../AGENTS.md) is actually protecting against.
**What happened**: writing the Drizzle admin client, the rule seemed to forbid a
module-scope connection pool — which would mean building a new pool per request.
**Why**: the rule exists because a Supabase client holds a user's session, so sharing one
across requests leaks that session to the next visitor. A postgres.js pool carries no
identity at all; it authenticates as one fixed role. Reusing it is not just safe, it is the
point, since Render runs a single persistent process.
**Takeaway**: the pool is a lazily created singleton with a comment naming the distinction,
so the next reader does not "fix" it. Rules are worth restating as the mechanism they
protect, not the shape they forbid.

### 2026-08-31 — Putting a secret in `nuxt.config.ts` would have broken the Docker build

**Concept**: build-time versus run-time configuration.
**What happened**: the obvious way to satisfy "configure `secretKey`" was
`secretKey: process.env.NUXT_SUPABASE_SECRET_KEY` in the module options.
**Why**: `nuxt.config.ts` is evaluated at build time, so that value gets baked into the
bundle. In Phase 6 the image is built once and the secret arrives at container start, so
the baked value would be whatever was set on the build machine — probably empty.
`@nuxtjs/supabase` already registers url, key and secretKey as `runtimeConfig`, and Nitro
overrides `runtimeConfig` from `NUXT_*` environment variables at run time.
**Takeaway**: leave it out of the config entirely and let the env var supply it. This is
the concrete reason behind the repo's "never read `process.env` at a call site" rule, which
until now read as style rather than consequence.

### 2026-08-31 — Nuxt UI owns the Tailwind installation

**Concept**: where a module's boundary actually sits.
**What happened**: [tech-stack.md](tech-stack.md) lists Tailwind and Nuxt UI as two
choices, which suggested installing `@nuxtjs/tailwindcss` alongside `@nuxt/ui`.
**Why**: Nuxt UI 4 depends on `tailwindcss`, `@tailwindcss/vite` and `@tailwindcss/postcss`
and registers the Vite plugin itself. A second Tailwind module would have produced two
competing pipelines. The real setup is two `@import` lines in one CSS file.
**Takeaway**: check what a module already pulls in before adding its dependencies
separately. Reading `node_modules/<pkg>/package.json` answered this faster than the docs.
