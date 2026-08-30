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

_Nothing yet. First entry due at the end of Phase 0._
