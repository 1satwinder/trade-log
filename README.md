# Tradelog

A small multi-tenant SaaS trade journal, built with Nuxt 4, Nitro and Supabase.

An organisation (a small trading desk, a prop-firm cohort, or a trading coach with
students) signs up. Each member logs trades into their own accounts. The app computes
P&L, win rate, average R multiple and an equity curve. A **member sees only their own
trades**; an **owner or admin sees everyone's in the organisation**. Members can publish
a read-only public journal page. Owners pay for Pro via Stripe.

## Why this project exists

This is a deliberate learning project with a portfolio purpose: to demonstrate ownership
of a full-stack application end to end, not just its frontend. The product is chosen so
that a very small schema forces contact with every concept worth learning — server-side
rendering strategies, cookie-based SSR auth, SQL migrations, role-aware row level
security, a backend-for-frontend layer, webhooks, scheduled work, realtime, and
deployment.

Scope discipline is a feature. If something does not teach one of the concepts in
[docs/plan.md](docs/plan.md), it does not get built.

## Status

Planning complete, implementation not started. See [docs/roadmap.md](docs/roadmap.md).

## Documentation

Read in this order if you are new to the project:

- [docs/plan.md](docs/plan.md) — the canonical plan: product, scope fence, concept map
- [docs/roadmap.md](docs/roadmap.md) — phases, exit criteria, progress tracking
- [docs/architecture.md](docs/architecture.md) — how the pieces fit and how a request flows
- [docs/data-model.md](docs/data-model.md) — schema, indexes, RLS policies, storage
- [docs/tech-stack.md](docs/tech-stack.md) — every dependency and why it is there
- [docs/decisions.md](docs/decisions.md) — decision log with trade-offs and rejected options
- [docs/security.md](docs/security.md) — authorisation model and the review checklist
- [docs/learning-log.md](docs/learning-log.md) — running notes on what was learned and what broke
- [docs/demo-script.md](docs/demo-script.md) — the three-minute walkthrough for a recruiter or client
- [AGENTS.md](AGENTS.md) — conventions and guardrails for AI-assisted implementation

## Getting started

Not yet applicable. This section gets filled in during Phase 0 with the real commands
for the local Supabase stack, environment variables and the dev server.

## Documentation rules

Two rules keep these files from rotting:

1. A doc is updated in the same commit as the change it describes, or it is deleted.
2. No doc restates another. Cross-link instead. `plan.md` owns intent, `architecture.md`
   owns mechanism, `data-model.md` owns the schema, `decisions.md` owns the reasoning.
