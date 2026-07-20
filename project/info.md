# Project Info

This file captures the facts an agent needs before executing the development
process in `project/process.md`. Keep it accurate — the process depends on it.

## Overview

- **Name:** `@worldware/msg-cli`
- **Description:** Command-line tool for the [`@worldware/msg`](https://github.com/worldware-studios/msg) library. Scaffolds i18n/l10n layout and wires a project up for use with msg (`init`, `create project`, `create resource`, `export`, `import`).
- **Repository:** `worldware-studios/msg-cli` (`git@github.com:worldware-studios/msg-cli.git`)
- **Default branch:** `main`
- **Issue tracker:** https://github.com/worldware-studios/msg-cli/issues
- **License:** MIT
- **Published binary:** `msg` (see `bin` / `oclif` config in `package.json`).

## Tech stack

- **Language:** TypeScript (strict mode, target ESNext, module CommonJS,
  `esModuleInterop`, `forceConsistentCasingInFileNames`, `skipLibCheck`; config
  in `tsconfig.json`).
- **Runtime:** Node.js (`.nvmrc` pins the version used by CI) + npm.
- **CLI framework:** [oclif](https://oclif.io) (`@oclif/core`); commands live in
  `src/commands/` and are registered via the `oclif` block in `package.json`.
- **Test runner:** [Vitest](https://vitest.dev) with `@vitest/coverage-v8`
  (config in `vite.config.mjs`).
- **Bundler:** [tsup](https://tsup.egoist.dev) (config in `tsup.config.ts`);
  emits both CJS (`.cjs`) and ESM (`.mjs`) plus type declarations to `dist/`.
- **Key dependencies:** `@worldware/msg`, `messageformat`,
  `@messageformat/icu-messageformat-1`, `@messageformat/parser`,
  `fast-xml-parser`.

## Repository structure

- `bin/` — oclif entrypoints: `run.js` (production) and `dev.js` (development),
  each with a `.cmd` shim for Windows.
- `src/commands/` — CLI command implementations: `init.ts`, `export.ts`,
  `import.ts`, and the `create` topic (`create/project.ts`, `create/resource.ts`).
- `src/lib/` — shared helpers: `init-helpers.ts`, `export-helpers.ts`,
  `import-helpers.ts`, `create-project-helpers.ts`, `create-resource-helpers.ts`,
  `msg-format.ts` (MsgFormat ↔ XLIFF `unit@type`), `pgs-mf1.ts` (ICU MF1 ↔ PGS),
  and `pgs-mf2.ts` (MessageFormat 2 ↔ XLIFF 2.2 PGS conversion).
- `src/specs/` — Markdown command specifications and `_template*.spec.md`
  templates (excluded from the build).
- `src/tests/` — Vitest tests (`*.test.ts`) and `fixtures/` (sample msg files,
  XLIFF, and expected output).
- `project/` — development process docs (`info.md`, `process.md`, `rules.md`).
- Root config: `package.json`, `tsconfig.json`, `tsup.config.ts`,
  `vite.config.mjs`, `.nvmrc`.

## Commands

- **Install deps:** `npm install`.
- **Test:** `npm test` (`vitest run`).
- **Coverage:** `npm run coverage` (`vitest run --coverage`).
- **Build:** `npm run build` (`tsup` → `dist/`).
- **Type-check:** `npx tsc --noEmit` (no dedicated npm script).
- **API docs:** `npm run docs` (`typedoc --entryPointStrategy expand
  src/commands src/lib` → git-ignored `docs/`).
- **Run the CLI locally:** `./bin/dev.js <command>` (runs from `src/` without a
  build); the built binary is exposed as `msg` via `bin/run.js`.

Note: there is currently no `lint` npm script. User-facing docs also live in
`README.md` and `src/specs/`.

## Continuous integration

- **`.github/workflows/ci.yml` (CI):** runs on pull requests and pushes to
  `main`. Checks out the repo, sets up Node from `.nvmrc`, then runs
  `npm ci`, `npx tsc --noEmit`, `npm test`, and `npm run build`. PRs must be
  green here before review.
- **`.github/workflows/verify-and-release.yml` (Verify and Release):** runs on
  pushes to `main`. A `verify` job runs type-check, tests, and build (plus
  dependency signature audit); a `release` job builds again and runs
  `npx semantic-release` when verify succeeds (GitHub release + npm publish via
  OIDC trusted publishing / provenance). `package.json` also defines
  `"prepack": "npm run build"` so `dist/` is always produced before
  `npm pack` / publish, even if a CI build step is skipped.
- **`.github/workflows/docs.yml` (Deploy static content to Pages):** runs on
  pushes to `main` (and `workflow_dispatch`). Runs `npm run docs` and deploys
  the generated `docs/` folder to GitHub Pages.
