---
name: flow-diagram
description: Writes or updates a high-level sequence or flow diagram in docs/flows/ that shows how trade-log's modules talk to each other (browser, Nuxt pages, Nitro routes, Supabase Auth, PostgREST, Postgres, Stripe, Resend), checked against the real code. Use when the user asks for a sequence diagram, flow diagram, or "how does X work end to end", or when finish-task closes a feature that crosses module boundaries.
---

# Flow diagram

A flow file in `docs/flows/` is kept and maintained, not a sketch in the chat (in-chat
diagrams belong to the `tutor` skill). It answers one question: **when this happens, who
talks to whom, and where is each decision made?**

## When a flow is warranted

Write or update one when a feature crosses at least two of these boundaries: browser,
Nuxt SSR, Nitro route, Supabase Auth, PostgREST, Postgres, or an external service (Stripe,
Resend, a price provider). A change that stays inside one layer, such as a new column or
a UI tweak, doesn't need one.

If a flow file already covers the path, update it rather than adding a new one.

## Workflow

```
- [ ] 1. Name the trigger and the outcome
- [ ] 2. Trace the path through the code
- [ ] 3. Verify against the running stack
- [ ] 4. Write docs/flows/<subject>.md
- [ ] 5. Link it from docs/architecture.md
```

1. **Trigger and outcome.** For example, "a member opens /app/trades" ending in "the
   rendered list contains only their trades". One trigger per file.
2. **Trace the path.** Follow it through the actual files: page, composable, route,
   `server/utils`, the query, the policy or trigger. Every arrow must correspond to code
   or configuration that exists. Mark a planned hop as `(from Mx)` rather than drawing it
   as if it were built.
3. **Verify.** Where it's cheap, exercise the path against the local stack, for example
   with `curl` to `$API_URL/rest/v1/...` using the `ANON_KEY` from
   `npx supabase status -o env`, or with the pgTAP test that covers it. Record the real
   status codes. Delete any probe users or rows afterwards.
4. **Write** the file using the template below.
5. **Link** it from the "Flows" list in `docs/architecture.md`.

## Diagram rules

- Stay high-level. Use **five to eight participants**, which are modules or services, not
  functions. A helper appears only when it is where the decision happens, as with
  `private.my_org_ids()` in an RLS flow.
- Use the same participant names as `docs/architecture.md`: Browser, Nuxt SSR, Nitro,
  Supabase Auth, PostgREST, Postgres, and so on.
- Use `sequenceDiagram` with `autonumber` for request and response paths. Use
  `flowchart` for decisions or for state that has no time order.
- Use `alt` and `else` for the two or three outcomes that matter (allowed, refused,
  invisible), each labelled with its real status code. Leave rare error paths out.
- Label arrows with the important fact (`Bearer JWT`, `Set-Cookie sb-*`, `set local role
authenticated`), not with function signatures.
- Use at most two diagrams per file. If you need a third, it's a second flow.

## Template

````markdown
# <Flow name>

**Trigger**: <what starts it> · **Outcome**: <what the user gets>
**Status**: built in <milestone>; <planned hops and the milestone that adds them>
**Last verified**: <YYYY-MM-DD>, against <how: local stack curl, pgTAP file, browser>

## Sequence

```mermaid
sequenceDiagram
  autonumber
  ...
```

## What each step guarantees

| Step | Guarantee                          | Enforced in           |
| ---- | ---------------------------------- | --------------------- |
| 3    | <the security or correctness fact> | `<file or migration>` |

## Files involved

- `<path>`: <its role in this flow>

## Related

- <links to the ADRs, docs/security.md invariants and other flows>
````

## Keeping flows honest

When a change alters a hop in an existing flow, update the flow in the same commit and
bump **Last verified**. An out-of-date diagram is worse than none, because it gets
believed.
