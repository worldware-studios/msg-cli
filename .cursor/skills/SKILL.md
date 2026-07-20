---
name: implement-github-issue
description: Implement a feature, bug fix, or task described in a GitHub issue by following this repo's development process. Use when the user asks to work on, implement, fix, or execute a GitHub issue (e.g. "work on issue #42", "implement #17", "fix the bug in issue 5").
---

# Implement a GitHub Issue

Execute the feature, bug fix, or task in a GitHub issue by following the repo's
development process end-to-end. The authoritative workflow lives in the project
docs — **read them before doing anything else**, in this order:

1. `project/process.md` — the phased workflow to follow.
2. `project/rules.md` — Definition of done, coding standards, commits,
   branches, and PR conventions that gate each phase.
3. `project/info.md` — repo facts: package name, repository, tech stack,
   structure, and commands.

Treat those files as the source of truth. If this skill and a project doc ever
conflict, follow the project doc and tell the user.

## Getting started

You need the issue number. If the user didn't give one, ask. Use the `gh` CLI
for all GitHub work (`gh issue view <n>`, `gh pr create`, `gh pr ready`, etc.).

## Workflow at a glance

The full detail is in `project/process.md`; do not skip reading it. The phases:

1. Review and verify the issue **[approval]**
2. Research, analyze, and select the best approach **[approval]**
3. Scaffold code + write failing tests; open a **draft PR** **[approval]**
4. Iteratively implement until tests pass **[approval]**
5. Review and optimize **[approval]**
6. Integration/e2e tests + coverage **[approval]**
7. Documentation **[approval]**
8. Final review and refactor **[approval]**
9. Review the execution process (meta-changes go in a *separate* PR)
10. Mark PR ready for review and drive it to merge-ready

## Non-negotiables

- **Pick a track first.** State whether you're on the **Standard** or
  **Lightweight** track at the start (see `project/process.md` → "Choosing a
  track") and let the user override it.
- **Respect approval gates.** Phases marked **[approval]** require explicit user
  approval before you proceed. Do not race ahead.
- **Honor the Definition of done.** Before requesting approval to advance a
  phase, run the relevant checks from `project/rules.md`: `npm test`,
  `npx tsc --noEmit`, `npm run build`, and `npm run coverage` (target > 90%).
- **TDD.** Write failing tests before implementation; don't weaken or delete
  tests to force a pass unless a test is proven wrong (explain why).
- **Branch + commits.** Branch `<repo>-<issue number>` off an up-to-date `main`;
  prefix intermediate commits with the phase (`scaffold:`, `implement:`,
  `optimize:`, `validate:`, `document:`, `refactor:`, `process:`) and reference
  the issue (e.g. `Refs #42`).
- **PR title = Conventional Commits.** The PR is squash-merged, so its title
  (`type(scope): summary`) becomes the landed commit. Open the PR as a draft
  early so CI runs throughout.

## Handling failures

If tests can't be made to pass, the approach proves wrong mid-implementation, or
any gate can't be met, **stop and surface the problem to the user with options**
rather than forcing the happy path. Prefer reverting a bad change over layering
fixes on top of it.
