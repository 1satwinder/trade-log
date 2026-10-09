---
name: finish-task
description: Runs trade-log's definition of done on the current changes - hygiene scan, lint, typecheck, unit and pgTAP tests, the security checklist, doc, flow-diagram and roadmap updates, learning-log prompts, and a drafted conventional-commit message. Use when the user says finish, wrap up, close out, definition of done, or asks whether a task or milestone is ready to commit.
disable-model-invocation: true
---

# Finish a task

Work through the steps below in order and report the results. **Never run `git commit`
or `git push`.** The user commits.

```
- [ ] 1. Scope the change
- [ ] 2. Hygiene scan
- [ ] 3. Checks
- [ ] 4. Required tests exist
- [ ] 5. Security checklist (if data access changed)
- [ ] 6. Docs, including flow diagrams for cross-module features
- [ ] 7. Learning prompts
- [ ] 8. Commit message draft
```

## 1. Scope the change

Run `git status --short` and `git diff --stat HEAD`, including untracked files. Classify
the change as one or more of: schema or migration, policy or grant, server route, pure
calculation, UI, config or env, or docs only. The classification decides which of the
later steps apply.

## 2. Hygiene scan

Check the changed files for these, and flag every hit:

- `console.log` or other debug output, especially anything printing config or secrets
- `process.env` anywhere other than `drizzle.config.ts`
- `event.node.`, a direct `createError(` outside `server/utils/errors.ts`, or a Supabase
  client created at module scope
- the service-role or Drizzle admin client with no justifying comment
- `any` in TypeScript
- staged files that should be ignored: `.env`, `*.local.txt`, or files under
  `server/db/generated/` other than `meta/`
- a new `runtimeConfig` key missing from `.env.example`
- a new function without a comment above it

## 3. Checks

```bash
npm run lint
npm run typecheck
npm run test                        # when there are Vitest tests
```

If anything under `supabase/` or `server/db/schema.ts` changed, also run:

```bash
npx supabase status                 # the local stack must be running
npm run db:reset
npm run test:db
npx supabase db advisors --local
npm run db:generate                 # must report "No schema changes"
```

Report each command as pass or fail. When something fails, show the output that matters;
don't paper over it.

## 4. Required tests exist (AGENTS.md)

- Pure calculations (P&L, win rate, R multiple) need Vitest tests.
- Every new policy needs a pgTAP test, and the test has been shown to go red when the
  policy is loosened.
- A bug fix needs a test that would have caught the bug.
- There is still exactly one Playwright happy path, not a growing suite.

## 5. Security checklist

If data access changed, go through every item in the "Review checklist" in
`docs/security.md`. Answer each with **yes**, **no** or **n/a**, plus one line of evidence
(a file and line, or a test name). Any **no** blocks the commit.

## 6. Docs, in the same commit

Update only what the change affects:

| Changed                                   | Update                                                                            |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| Schema, index or grant                    | `docs/data-model.md`, and the ER diagram in `docs/database-architecture.md`       |
| Mechanism, such as data path or auth flow | `docs/architecture.md`                                                            |
| A choice that had a real alternative      | a new ADR in `docs/decisions.md`                                                  |
| A milestone moved                         | `docs/plans/phase-N.md`: the milestone table, what was built, decisions, verified |
| A roadmap item landed                     | tick it in `docs/roadmap.md`, and update the status line                          |

An ADR takes the next number and today's date, and has the sections **Context**,
**Decision**, **Rejected** and **Consequences**. If it reverses an earlier ADR, mark that
one superseded rather than editing it.

**Flows.** If the change completes a feature that crosses module boundaries (browser,
Nitro, Supabase Auth, PostgREST, Postgres, external services), or changes a hop in an
existing file in `docs/flows/`, follow the `flow-diagram` skill. Read
`.cursor/skills/flow-diagram/SKILL.md` and write or update the flow before drafting the
commit.

## 7. Learning prompts

Don't write in `docs/learning-log.md`; the user writes it. Instead:

- List two to four things from this task that were surprising, broke, or worked
  differently than expected. Write each as a one-line "hit X, the cause was Y" summary
  with a suggested entry title.
- Name any question under "Questions to be able to answer out loud" that this task now
  makes answerable.

## 8. Commit message draft

Use a conventional-commit prefix (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:` or
`test:`), present tense, and explain why rather than restating the diff. Migrations go in
the same commit as the code that depends on them. If the changes are unrelated, propose
separate commits, each with its own file list.

```
feat: add signup trigger that provisions a personal org

Every user needs a profile, an org, an owner membership and a default account
before any policy can resolve their tenancy, so it happens in the signup's own
transaction rather than on first request.
```

## Report format

End with a short summary:

- **Ready to commit**, or **Blocked**, with the blocking items listed first
- the commands run, with pass or fail for each
- the docs updated
- the learning prompts
- the drafted commit message, or messages
