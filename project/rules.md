# Project Rules

Rules referenced by `project/process.md`. They cover the definition of done,
coding standards, commits, branches, and pull requests. When a rule and the
process conflict, fix the conflict rather than silently ignoring either.

## Definition of done

A change is only "done" when all of the following pass locally:

1. **Tests:** `npm test` — all tests green.
2. **Type-check:** `npm run typecheck` — no type errors in `src/`, including
   tests and fixtures.
3. **Build:** `npm run build` — compiles cleanly with tsup.
4. **Coverage:** `npm run coverage` — meets the coverage target (see below);
   it exits non-zero when a Vitest coverage threshold is not met.
5. **Docs:** command/flag/arg behavior changes are reflected in `README.md`
   and the relevant `src/specs/*.spec.md` files.

Do not request approval to advance a process phase until the checks relevant to
that phase pass.

## Coding standards

- **TypeScript strict mode.** Honor `strict` in `tsconfig.json`.
- **Avoid `any`.** Prefer precise types, generics, or `unknown` with narrowing.
- **Modules:** use `import`/`export` with `.js` extensions in relative imports
  (as elsewhere in this repo). `tsconfig` emits CommonJS; tsup also builds ESM.
- **Naming:** clear, descriptive names for variables, functions, and classes.
- **File layout:**
  - oclif commands in `src/commands/` (nested for topics, e.g.
    `src/commands/create/project.ts`)
  - shared helpers in `src/lib/`
  - command specifications in `src/specs/`
  - tests in `src/tests/` named `*.test.ts`
- **Public surface:** the published CLI (`msg` via oclif). Changing command
  names, flags, args, or observed behavior is a breaking change and must be
  called out explicitly. Helpers under `src/lib/` are internal.
- **Comments:** explain intent and trade-offs, not what the code obviously does.
- **Formatting:** follow the surrounding code style; do not reformat unrelated
  code in a change.

## Testing

- Every new feature ships with tests; every bug fix ships with a test that fails
  before the fix and passes after.
- Write tests before implementation (TDD) as described in the process.
- **Coverage target:** cumulative line/branch coverage **> 90%**; aim higher.
  The target applies to the whole suite, not only integration/e2e tests. It is
  enforced by `coverage.thresholds` in `vite.config.mjs` (90 for lines,
  branches, functions, and statements) and checked in CI.
- **Test files must type-check.** `tsconfig.test.json` checks `src/tests/`
  (as ESM, the way Vitest runs them); `npm run typecheck` runs it alongside
  the build config. Fix test type errors rather than casting them away.
- **Coverage below target on `main`:** if `main` is already below the target,
  a PR meets the coverage gate when it does not lower any coverage metric
  relative to `main` (compare `npm run coverage` on both) and the shortfall is
  tracked in an open issue. Say so when requesting approval rather than adding
  unrelated tests to the PR.
- **Measure the `main` baseline on a clean checkout.** Run coverage for `main`
  in a separate worktree (`git worktree add <dir> main`, symlink
  `node_modules`, run `npm run coverage` there, then `git worktree remove`).
  Do not use `git stash` or revert only the source: the branch's new tests
  stay behind and skew the baseline.
- **Resolve symlinks in expected paths.** When code under test derives a path
  from `process.cwd()`, build the expected value from `realpathSync(...)`, not
  from `tmpdir()` directly. On macOS `/var` is a symlink to `/private/var`, so
  the two differ.
- Do not weaken or delete tests to make a change pass unless the test is proven
  wrong; if so, explain why.
- **Bugs found while writing tests:** if a test reveals a bug outside the
  issue's scope, do not assert the wrong behavior. Either record the correct
  behavior with `test.fails` and a comment linking the issue (so it turns red
  once fixed), or leave that path untested. Open a `fix:` issue rather than
  widening the PR.

## Branches

- Branch off an up-to-date default branch: `git checkout main && git pull`
  before creating the work branch.
- Name the work branch `<repo>-<issue number>` (e.g. `msg-cli-42`).
- Keep one branch per issue.

## Commits

Intermediate commits made by an agent while working an issue are **temporary
scaffolding** — they are squashed when the PR is merged, so their individual
messages do not need to satisfy Conventional Commits. Optimize them for
traceability through the phases instead.

- Prefix each intermediate commit with its process phase:
  `scaffold:`, `implement:`, `optimize:`, `validate:`, `document:`,
  `refactor:`, or `process:` (see `project/process.md`).
- Write the summary in the imperative mood, <= 72 characters.
- Use the body to explain the "why"; reference the issue (e.g. `Refs #42`).
- Commit in small, coherent units — do not batch an entire phase into one
  opaque commit. A phase may produce several commits.
- Never commit generated output (`dist/`, `coverage/`, `docs/`), secrets, or
  `.env` files. Generated API docs are produced on demand via `npm run docs`
  and are git-ignored like other build output.

## Pull requests

- The PR is the unit that lands on the default branch: it is **squash-merged**,
  so the squashed commit inherits the PR title.
- **Title the PR using [Conventional Commits](https://www.conventionalcommits.org):**
  `type(scope): summary`, e.g. `feat(init): add force overwrite flag`.
  - Allowed types: `feat`, `fix`, `refactor`, `test`, `docs`, `build`, `chore`,
    `perf`, `ci`.
- Open a **draft PR early** (after the first pushed commit) so CI runs
  throughout, and mark it ready for review at the end of the process.
- Target the parent/default branch (`main` unless told otherwise).
- PR description must explain the "why" as well as the "what", link the issue,
  and include examples where useful.
- CI (type-check + tests with coverage thresholds + build) must be green
  before requesting review.
- Respond to review comments and CI failures promptly; push fixes as new
  commits rather than force-pushing shared history.
- Keep PRs focused and reasonably sized; split large work into multiple PRs.
- Meta-changes to `project/process.md` or `project/rules.md` belong in a
  separate PR from feature work. Exception: edits that only describe tooling
  changed in the same PR (e.g. a new command in the Definition of done) stay
  in that PR, so the docs are never wrong on `main`. Process improvements from
  a phase 9 retrospective still go in their own PR.

## Dependencies

When bumping `@worldware/msg` or other sibling packages, verify the published
npm tarball includes `dist/` before relying on it — e.g.
`npm pack @worldware/pkg@version --dry-run` and confirm dist files are listed.
Sibling repos now run `"prepack": "npm run build"` so pack/publish always
produces build output (msg-cli: PR #21; `@worldware/msg`: worldware-studios/msg#46,
after v0.8.0 shipped without `dist/`).

## Failure handling

- If tests cannot be made to pass, or the chosen approach proves wrong
  mid-implementation, stop and surface the problem to the user with options
  rather than forcing the happy path.
- Prefer reverting a bad change over layering fixes on top of it.
