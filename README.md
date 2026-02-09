# msg-cli

## Overview

msg-cli is a command-line tool for the [msg](https://github.com/worldware-studios/msg) library. It helps you scaffold internationalization (i18n) and localization (l10n) layout and wire up your project for use with msg.

**Current status:** Implemented commands: `init` (scaffold i18n/l10n and config) and `create project` (template a new MsgProject file in i18n/projects).

## Installation

Install globally:

```bash
npm install -g @worldware/msg-cli
```

Or use via `npx`:

```bash
npx @worldware/msg-cli <command>
```

For project-local setup, run `msg init` in your project root to add msg and msg-cli as dependencies and scaffold directories and config.

## Core Concepts

- **i18n (internationalization):** Source message projects and resources. MsgProject and MsgResource files live under the i18n directory (default `src/i18n`).
- **l10n (localization):** Exported XLIFF files and imported translation JSON. Exports and translation data live under the l10n directory (default `res/l10n`).
- **Import aliases:** The init command adds `#i18n/*` and `#l10n/*` (and `#root/*`) to `package.json` so you can import with short paths like `import project from '#i18n/projects/main'`.

## Usage

**Commands:** `init`, `create project`.

### init

Scaffold a msg project: create i18n and l10n directories, update `package.json` (directories, import aliases, scripts), optionally update `tsconfig.json` for path aliases, and install `@worldware/msg`.

```bash
msg init
```

| Flag | Description |
|------|-------------|
| `-h`, `--help` | Show help for the init command. |
| `-i` | Interactive: prompt for i18n and l10n directory paths. |
| `-f`, `--force` | Force a clean run; overwrite or re-apply existing msg setup. |
| `--i18nDir <path>` | Relative path for the i18n directory (default: `src/i18n`). |
| `--l10nDir <path>` | Relative path for the l10n directory (default: `res/l10n`). |

**Examples:**

```bash
# Default layout (src/i18n, res/l10n)
msg init

# Custom paths
msg init --i18nDir lib/i18n --l10nDir data/l10n

# Re-run and overwrite existing setup
msg init -f

# Prompt for paths
msg init -i
```

**What init does:**

1. Creates `i18n` with subdirectories `projects` and `resources`, and `l10n` with `translations` and `xliff` (or your custom paths).
2. Adds `.gitkeep` in each leaf directory.
3. Adds `directories.i18n`, `directories.l10n`, and `directories.root` to `package.json`.
4. Adds import aliases `#i18n/*`, `#l10n/*`, and `#root/*` to `package.json`.
5. Adds scripts `i18n-export` and `l10n-import` (pointing to `msg export:resources` and `msg import:translations`) for when those commands are available.
6. If `tsconfig.json` exists, adds `compilerOptions.baseUrl` and `compilerOptions.paths` for the aliases.
7. Installs the latest `@worldware/msg` as a dependency.

### create project

Create a new MsgProject file in the i18n projects directory. Requires `package.json` with `directories.i18n` and `directories.l10n` (run `msg init` first).

```bash
msg create project <projectName> <source> <targets...> [--extend <name>]
```

| Argument     | Required | Description                              |
|-------------|----------|------------------------------------------|
| `projectName` | Yes      | Name of the project (used as file name). |
| `source`      | Yes      | Source locale (e.g. `en`).               |
| `targets`     | Yes (≥1) | Target locale(s), e.g. `fr`, `de`, `es`. |

| Flag        | Short | Description                    |
|------------|-------|--------------------------------|
| `--extend` | `-e`  | Extend an existing project.   |
| `--help`   | `-h`  | Show help for create project.  |

**Examples:**

```bash
# Create project myApp with source en and targets fr, de
msg create project myApp en fr de

# Extend an existing project
msg create project extendedApp en de --extend base

# Help
msg create project -h
```

**Behavior:**

- Writes the file to `i18n/projects/<projectName>.js` or `.ts` (TypeScript if `tsconfig.json` exists).
- Uses ES module or CommonJS export based on `package.json` `"type"`.
- Generates a translation loader that imports from `l10n/translations` using the relative path from `i18n/projects` (from `directories` in package.json).
- With `--extend <name>`, merges target locales and pseudoLocale from the existing project.
- Errors if the project name already exists, package.json is missing or invalid, or required directories are not configured.

## API Reference

The CLI does not expose a programmatic API. For library usage, see [@worldware/msg](https://github.com/worldware-studios/msg).

## Development

- **Setup:** `npm install`
- **Build:** `npm run build`
- **Tests:** `npm run test`
- **Coverage:** `npm run coverage`

Source layout:

- `src/commands/` — CLI commands (init, create/project).
- `src/lib/` — Shared utilities and init helpers.
- `src/specs/` — Feature and command specs.
- `src/tests/` — Vitest tests and fixtures.

## License

MIT. See [LICENSE](LICENSE).

## Keywords

i18n, l10n, internationalization, localization, xliff, msg, cli
