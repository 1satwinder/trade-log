# Demo script

Three minutes, no login required to start, nothing off-script. This exists because a
portfolio project that needs explaining does not work as a portfolio project.

Write the final wording once Phase 3 lands. The structure below is the target, and it
doubles as an acceptance test: if a step cannot be demonstrated smoothly, that is a
product bug, not a presentation problem.

## Audience variants

Same path, different emphasis:

- **Hiring manager or senior engineer**: spend the time on the authorisation demo and the
  architecture. They care whether tenancy is real.
- **Recruiter**: stay on the product surface. Watchable, not technical.
- **Freelance client**: emphasise how fast a comparable app could be built for them, and
  point at invitations, billing and the public page as reusable pieces.

## The path

**0:00 — The public page.** Open the marketing page. One sentence on what the product is
and who it is for.

**0:20 — A published journal.** Open a share link while logged out. Point out that this
page is served from cache and needs no session, and that it shows only what the owner
chose to publish.

**0:40 — Demo login.** One click into a seeded organisation. Trades list, filters, the
equity curve, win rate and average R multiple.

**1:10 — Log a trade.** Create one live, attach a chart screenshot, close it and watch the
statistics change.

**1:40 — The authorisation demo.** The set piece. Switch from the manager account to a
member account: the same page now shows only that member's trades. Say plainly that this
is enforced by database policies, not by the UI, and that a test fails if it ever stops
being true.

**2:10 — The team surface.** Invite flow and roles. Mention the invite email and that the
token is hashed, single-use and expiring.

**2:30 — Billing.** Upgrade in Stripe test mode, and show that the free-tier limit is
enforced server-side rather than by hiding a button.

**2:45 — Under the hood, briefly.** One diagram from
[architecture.md](architecture.md): SSR and API in Nitro, three deliberate data access
paths, a scheduled task refreshing prices, realtime marks. Offer
[decisions.md](decisions.md) as the follow-up read.

## Things to have ready but not show unprompted

- The RLS test file, to open if isolation is questioned
- The Stripe webhook handler, for the idempotency question
- The Dockerfile and the Render setup, if infrastructure comes up
- One learning-log entry describing something that broke and how it was fixed

## Rules

- No apologising for missing features. The non-goals in [plan.md](plan.md) are choices,
  and should be stated as choices.
- Never demo from a local dev server. Production, or it does not count.
- If something fails live, say what you would check first. That answer is worth more than
  a flawless click-through.
