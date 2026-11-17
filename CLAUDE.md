# CLAUDE.md

`@worldware/msg-cli` — the `msg` command-line tool for
[`@worldware/msg`](https://github.com/worldware-studios/msg) (TypeScript,
oclif, Vitest, tsup).

## Source of truth

Before working on a GitHub issue, read these in order. They are authoritative;
if anything here conflicts with them, follow them and say so.

1. [project/process.md](project/process.md) — the phased development workflow.
2. [project/rules.md](project/rules.md) — Definition of done, coding standards,
   branches, commits, PR conventions, and dependency bumps.
3. [project/info.md](project/info.md) — repo facts, structure, and commands.

The `/implement-github-issue <n>` skill walks through that workflow.

## Commands

| Purpose          | Command                     |
| ---------------- | --------------------------- |
| Tests            | `npm test`                  |
| Type-check       | `npx tsc --noEmit`          |
| Build            | `npm run build`             |
| Coverage         | `npm run coverage`          |
| API docs         | `npm run docs`              |
| Run CLI from src | `./bin/dev.js <command>`    |

## Non-negotiables

- **Approval gates:** phases marked **[approval]** in `project/process.md` end
  your turn. Wait for explicit approval before continuing.
- **TDD:** write failing tests first; don't weaken tests to force a pass.
- **Definition of done:** tests, type-check, build, and coverage (> 90%, or no
  regression vs `main` while `main` is below target; see `project/rules.md`)
  pass before asking to advance a phase.
- **Branches:** `msg-cli-<issue number>`, cut from an up-to-date `main`.
- **Commits:** prefix intermediate commits with the phase (`scaffold:`,
  `implement:`, `optimize:`, `validate:`, `document:`, `refactor:`,
  `process:`) and reference the issue (`Refs #42`).
- **PRs:** open as a draft early; the title follows Conventional Commits
  because it becomes the squashed commit.
- **Public surface:** the published `msg` CLI. Changing command names, flags,
  args, or observed behavior is a breaking change and must be called out;
  update `README.md` and `src/specs/` to match. `src/lib/` is internal.
- **`@worldware/msg` bumps:** confirm the published tarball includes `dist/`
  (`npm pack @worldware/msg@<version> --dry-run`) before relying on it.
- Never commit `dist/`, `coverage/`, `docs/`, or `.env` files.
