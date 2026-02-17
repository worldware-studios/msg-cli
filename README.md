# msg-cli

## Overview

msg-cli is a command-line tool for the [msg](https://github.com/worldware-studios/msg) library. It helps you scaffold internationalization (i18n) and localization (l10n) layout and wire up your project for use with msg.

**Current status:** CLI for the msg library (npm: `@worldware/msg-cli`). Commands: `init` (scaffold i18n/l10n and config), `create project` (new MsgProject in i18n/projects), `create resource` (new MsgResource in i18n/resources), `export` (serialize MsgResources to XLIFF 2.0 in l10n/xliff).

## Installation

Install globally:

```bash
npm install -g @worldware/msg-cli
```

Or use via `npx`:

```bash
npx msg <command>
```

For project-local setup, run `msg init` in your project root to add msg and msg-cli as dependencies and scaffold directories and config.

## Core Concepts

- **i18n (internationalization):** Source message projects and resources. MsgProject and MsgResource files live under the i18n directory (default `src/i18n`).
- **l10n (localization):** Exported XLIFF files and imported translation JSON. Exports and translation data live under the l10n directory (default `res/l10n`).
- **Import aliases:** The init command adds `#i18n/*` and `#l10n/*` (and `#root/*`) to `package.json` so you can import with short paths like `import project from '#i18n/projects/main'`.

## Usage

**Commands:** `init`, `create project`, `create resource`, `export`.

### init

Scaffold a msg project: create i18n and l10n directories, update `package.json` (directories, import aliases, scripts), optionally update `tsconfig.json` for path aliases, and install `@worldware/msg`.

```bash
msg init
```

| Flag | Description |
|------|-------------|
| `-h`, `--help` | Show help for the init command. |
| `-i` | Interactive: prompt for i18n and l10n directory paths. |
| `-f`, `--force` | Force clean install; overwrite existing msg setup. |
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
5. Adds scripts `i18n-export` and `l10n-import` (pointing to `msg export` and `msg import`) for when those commands are available.
6. If `tsconfig.json` exists, adds `compilerOptions.baseUrl` and `compilerOptions.paths` for the aliases.
7. Installs the latest `@worldware/msg` as a dependency.

### create project

Create a new MsgProject file in the i18n projects directory. Requires `package.json` with `directories.i18n` and `directories.l10n` (run `msg init` first).

```bash
msg create project <projectName> [source] [targets...] [--extend <name>]
```

| Argument     | Required | Description                              |
|-------------|----------|------------------------------------------|
| `projectName` | Yes      | Name of the project (used as file name). |
| `source`      | Yes*     | Source locale (e.g. `en`).               |
| `targets`     | Yes* (≥1) | Target locale(s), e.g. `fr`, `de`, `es`. |

\* `source` and `targets` are optional when `--extend` is passed; they are inherited from the base project.

| Flag        | Short | Description                    |
|------------|-------|--------------------------------|
| `--extend` | `-e`  | Extend an existing project.   |
| `--help`   | `-h`  | Show help for create project.  |

**Examples:**

```bash
# Create project myApp with source en and targets fr, de
msg create project myApp en fr de

# Extend an existing project (inherits source and targets from base)
msg create project extendedApp --extend base

# Extend and add/override locales
msg create project extendedApp en de --extend base

# Help
msg create project -h
```

**Behavior:**

- Writes the file to `i18n/projects/<projectName>.js` or `.ts` (TypeScript if `tsconfig.json` exists).
- Uses ES module or CommonJS export based on `package.json` `"type"`.
- Generates a translation loader that imports from `l10n/translations` using the relative path from `i18n/projects` (from `directories` in package.json).
- With `--extend <name>`, merges target locales and pseudoLocale from the existing project. If `source` and `targets` are omitted, they are inherited from the base project.
- Errors if the project name already exists, package.json is missing or invalid, or required directories are not configured.

### create resource

Create a new MsgResource file in the i18n resources directory. Requires `msg init` and a project file in `i18n/projects` (run `msg create project` first).

```bash
msg create resource <projectName> <title> [-f] [-e]
```

| Argument     | Required | Description                                        |
|-------------|----------|----------------------------------------------------|
| `projectName` | Yes      | Name of the project to import in the MsgResource.  |
| `title`       | Yes      | Title of the resource and file name (e.g. `messages` → `messages.msg.js`). |

| Flag        | Short | Description                              |
|------------|-------|------------------------------------------|
| `--force`  | `-f`  | Overwrite an existing resource file.     |
| `--edit`   | `-e`  | Open the file for editing after creation.|
| `--help`   | `-h`  | Show help for create resource.           |

**Examples:**

```bash
# Create resource messages for project myProject
msg create resource myProject messages

# Overwrite existing resource
msg create resource myProject messages --force

# Create and open in editor
msg create resource myProject messages --edit
```

**Behavior:**

- Writes the file to `i18n/resources/<title>.msg.js` or `.msg.ts` (TypeScript if `tsconfig.json` exists).
- Uses ES module or CommonJS export based on `package.json` `"type"`.
- Sets `lang` from the project's `sourceLocale` and `dir` to `rtl` for Arabic/Hebrew, `ltr` otherwise.
- Includes a minimal example message. Validates that the generated file is importable.
- Errors if i18n/projects or i18n/resources does not exist, the project is not found, or the resource file already exists (unless `--force`).

### export

Serialize all MsgResource files in `i18n/resources` to XLIFF 2.0 files in `l10n/xliff`, one file per project. Does not send files for translation; use your own translation workflow with the generated XLIFF. Requires `package.json` with `directories.i18n` and `directories.l10n` (run `msg init` first).

```bash
msg export [-p <projectName>]
```

| Flag         | Short | Description                                |
|-------------|-------|--------------------------------------------|
| `--project` | `-p`  | Export only the named project.             |
| `--help`    | `-h`  | Show help for the export command.          |

**Examples:**

```bash
# Export all projects to l10n/xliff
msg export

# Export only project "myApp"
msg export --project myApp
msg export -p myApp
```

**Behavior:**

- Recursively finds all `.msg.js` and `.msg.ts` files under `i18n/resources`.
- Imports each file as a MsgResource; errors if any file is invalid.
- Groups resources by project name and writes one XLIFF 2.0 file per project to `l10n/xliff` (e.g. `myApp.xliff`).
- With `--project`, only that project is exported; existing other files in `l10n/xliff` are not removed.
- If no MsgResource files are found, exits with an informational message (no error).
- Logs each major step (finding files, importing, grouping, writing).

**What is preserved in XLIFF 2.0:**

- **Message keys** — Stored as unit `id` (sanitized for XML) and `name` (original key).
- **Resource notes** — Emitted as file-level `<notes>` with category (e.g. `description`, `comment`).
- **Resource attributes** — `dir` → file `srcDir`; `dnt` → file `translate="no"`.
- **Message notes** — Emitted as unit-level `<notes>` with category (e.g. `description`, `context`, `parameters`).
- **Message attributes** — `dnt` → unit `translate="no"`; message `dir` is serialized as the unit’s `srcDir` attribute (XLIFF 2.0 text direction for the segment).

## API Reference

The CLI does not expose a programmatic API. For library usage, see [@worldware/msg](https://github.com/worldware-studios/msg).

## Development

- **Repository:** [github.com/worldware-studios/msg-cli](https://github.com/worldware-studios/msg-cli)
- **Setup:** `npm install`
- **Build:** `npm run build`
- **Tests:** `npm run test`
- **Coverage:** `npm run coverage`

Source layout:

- `src/commands/` — CLI commands (init, export, create/project, create/resource).
- `src/lib/` — Shared utilities, init helpers, export-helpers, create-project helpers, and create-resource helpers.
- `src/specs/` — Feature and command specs.
- `src/tests/` — Vitest tests and fixtures.

## License

MIT. See [LICENSE](LICENSE).

## Keywords

i18n, l10n, internationalization, localization, xliff, msg, cli
