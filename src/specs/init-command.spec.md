## 1. Overview

The `init` command scaffolds a `msg` project. This involves four steps:

1. Installing `@worldware/msg` as a dependency and `@worldware/msg-cli` as a development dependency
2. Creating `i18n` and `l10n` directories with subdirectories.
3. Adding `i18n` and `l10n` paths to `directories` in `package.json`
4. Create `#i18n` and `#l10n` import aliases in the `imports` section of `package.json`
5. Adding `i18n-export` and `l10n-import` scripts to `package.json`

### Installation

`msg` and `msg-cli` should be installed using child processes spawned in the init command. It is important that `msg-cli` only be installed as a development dependency. In both cases, the `latest` versions should be installed.

### Directories

By default, the `i18n` directory/path is `src/i18n`, and the `l10n` directory/path is `res/l10n`. This can be overridden using the `--i18nDir` and `--l10nDir` flags, each of which takes a string indicating the relative path.

#### `i18n` Directory

The subdirectories in the `i18n` directory are `projects` and `resources`. The `projects` directory is for `MsgProject` files that export `MsgProject` instances. The `resources` directory is for `MsgResource` files that import the `MsgProject` instances defined in the `MsgProject` files, and export `MsgResource`instances. `MsgResource` files have `.msg.` in the filename before the file extension, so that they can be colocated with code anywhere in the `src` directory, but shared resources used by multiple features should be kept in the `resources` directory. Project and resource filenames do not need to be the same as the project names and resource titles. Project names and resource titles are only used during resource export, translation import, and translation loading.  

#### `l10n` Directory

The subdirectories inside the `l10n` directory are `translations` and `xliff`. The `xliff` directory is used for both the source locale xliff 1.2 exports and translated bilingual xliff 1.2 files. Export filenames are based on the project name (`<project>.xlf`), while import filenames are based on the project name and target locale (`<project>.<locale>.xlf`). The `translations` directory holds the `MsgResource` translation data files extracted from the translated bilingual xliff files. The translation data files are serialized in JSON format. The JSON files are located inside `project` and `locale` directories, with the name of the JSON file being the same as the title of the `MsgResource`. For example, `res/l10n/<project>/<locale>/<title>.json`.

### `package.json` Changes

#### Directories

Running the `init` command adds the following entries under `directories` in the project's `package.json` file:

```json
{
  "directories": {
    "i18n": "path/to/i18n/dir",
    "l10n": "path/to/l10n/dir",
    "root": "."
  }
}
```

This has no runtime implications, but is used by the cli commands when determing where to write files.


#### Imports

Running the `init` command creates the following entries under `imports` in the project's `package.json` file.

```json
{
  "imports": {
    "#i18n/*": "./<i18n directory>/*",
    "#l10n/*": "./<l10n directory>/*",
    "#root/*": "./*"
  }
}
```

This creates an alias that allows shorthand imports such as `import project from '#i18n/projects/main'` or `import resource from '#i18n/resources/messages.msg'`. If the project is a typescript project, init will also add the following to `tsconfig.json` in order to support intellisense and code navigation:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "#i18n/*": ["./<i18n directory>/*"],
      "#l10n/*": ["./<l10n directory>/*"],
      "#root/*": ["./*"]
    }
  }
}
```

#### Scripts

The init command adds the following scripts to package.json under the scripts section:

```json
{
  "scripts": {
    "i18n-export": "msg export resources",
    "l10n-import": "msg import translations"
  }
}
```

## 2. Context

### User Segments

- `Application Developers` : `Frontline developers building web applications`
- `Localization Engineers` : `Localization engineeers or TPMS localizing web applications`

### User Stories

- As an `application developer`, I want `a quick and easy way to scaffold all the folder in a msg project`, so that `I don't have to scaffold it manually`.
- As an `application developer`, I want `path shortcuts for i18n and l10n directories`, so that `I can import from them quickly in code`.
- As an `application developer`, I want `custom scripts for i18n resource export and translation import` so that `I can easily manage i18n resources localization translation data, and can automate the process`.
- As a `localization engineer`, I want `the ability to set the i18n and l10n directory paths`, so that `I can develop custom solutions`.
- As a `localization engineer`, I want `the i18n and l10n directory paths to be specified in the directories section of the project package.json file`, so that `I can easily calculate the relative path from the i18n directory to the l10n directory`.

## 3. Functionality

### Primary Functions

- It `creates the i18n directory and subdirectories` in order to `have a central place for MsgProject and MsgResource files`.
- It `creates the l10n directory and subdirectories` in order to `have a central place for xliff exports and imports and translation JSON files`.
- It `adds i18n and l10n directories to package.json` in order to `make it possible to determine the relative path between them`.
- It `adds #i18n and #l10n import aliases to package.json` in order to `make it easier to import i18n and l10n files`.
- It `adds i18n-export and l10n-import script aliases to package.json` in order to `make it easy to export resources and import translation data`.

### Secondary Functions

- It `updates tsconfig.json` in order to `allow for intellisense and code navigation in typescript`.
- It `adds .gitkeep files to the i18n and l10n subdirectories` in order to `keep them in git`.
- It `prompts the user for i18n and l10n directory paths when the -i flag is used` in order to `make setup interactive`.
- It `logs all actions, errors and warnings to the console` so that `the user can see what is happening`.
- It `provides a -f or --force option` so that `it is possible to do a clean install`. 
- It `provides --i18nDir or --l10nDir options` so that `it is possible to customize the paths to these`. 


## 4. Behavior

### Requirements

- It should create the `i18n` directory inside a `src` directory, by default.
- It must create the `projects` and `resources` subdirectories inside the `i18n` directory.
- It should create the `l10n` directory inside a `res` directory, by default.
- It must create the `translations` and `xliff` subdirectories inside the `l10n` directory.
- It should add `.gitkeep` to all leaf directories it creates.
- It should install the **latest** version of `@worldware/msg` as a dependency.
- It should install the **latest** version of `@worldware/msg-cli` as a development dependency.
- It must be cross-platform and work on windows and unix-like systems.
- It must use the `oclif create:command` generator to create the command files.

### Constraints

- It must not ovewrite an existing `msg` installation unless the `-f` or `--force` flags are used
- It must not replace a directory if it is not empty unless the `-f` or `--force` flags are used.
- It should not prompt for `i18n` directory path if the `--i18nDir` option is used
- It should not prompt for `l10n` directory path if the `--l10nDir` option is used

## 5. Design

### Interface


| Command   | Arguments     | Flags           | Notes   |
| --------- | ------------- | --------------- | ------- |
| `init` | `--no arguments--` | `-i` | `interactive mode` |
| `init` | `--no arguments--` | `-f` or `--force` | `force a clean install` |
| `init` | `--no arguments--` | `--i18nDir` | `specify a custom i18n dir path` |
| `init` | `--no arguments--` | `--l10nDir` | `specify a custom l10n dir path` |
| `init` | `--no arguments--` | `-h` or `--help` | `show command help message` |


### Inputs


| Argument   | Type   | Required | Notes   |
| ---------- | ------ | -------- | ------- |
| `--no arguments--` | `na` | `na`    | `no arguments for the init command` |


### Options


| Option   | Type   | Short   | Long   | Notes   |
| -------- | ------ | ------- | ------ | ------- |
| `interactive mode` | `boolean` | `-i` | `` | `no long form` |
| `force` | `boolean` | `-f` | `--force` | `clean install` |
| `i18n dir` | `string` | `` | `--i18nDir` | `no short form` |
| `l10n dir` | `string` | `` | `--l10nDir` | `no short form` |
| `help` | `boolean` | `-h` | `--help` | `help notes` |


### Outputs


| Output   | Channel   | Notes   |
| -------- | ------ | ------- |
| `logs` | `STDOUT` | `log actions to the console` |
| `errors` | `STDERR` | `trigger errors in the console` |
| `warning` | `STDOUT` | `log warning to the console` |


### Outcomes


| Outcome   | Type   | Notes   |
| --------- | ------ | ------- |
| `@worldware/msg` | `package` | `installed latest version` |
| `@worldware/msg-cli` | `package` | `installed latest version. **skip for now**` |
| `i18n` | `directory` | `inside the src folder by default` |
| `i18n/projects` | `directory` | `holds MsgProject files` |
| `i18n/resources` | `directory` | `holds MsgResource files, with .msg. before the file extension` |
| `l10n` | `directory` | `inside the res folder by default` |
| `l10n/translations` | `directory` | `holds JSON translation data files, organized by project and locale, with resource titles as filenames` |
| `l10n/xliff` | `directory` | `holds xliff exports and translated xliffs` |
| `.gitkeep` | `file` | `all leaf directories` |
| `package.json` | `file` | `updates with directories, imports and scripts` |


## 6. Architecture

### Technologies


| Technology   | Development Only | Notes   |
| ------------ | ---------------- | ------- |
| `oclif` | `no`            | `cli framework` |
| `process.exec` | `no`            | `subprocess for npm installs` |
| `path` | `no`            | `path joining, resolving; relative path resolution` |
| `mkdir` | `no`            | `creating directories ` |


### Components


| Component   | Notes   |
| ----------- | ------- |
| `command` | `--` |
| `i18n dir` | `--` |
| `l10n dir` | `--` |
| `package.json directory entries` | `--` |
| `package.json import entries` | `--` |
| `package.json script entries` | `--` |


### Operations

1. Install dependencies
2. Scaffold directories
3. Modify `package.json`


## 7. Implementation

### Environment Variables

**no evironment variables required**

### Configurations


| Configuration   | Type   | Location   | Notes   |
| --------------- | ------ | ---------- | ------- |
| `tsconfig.json` | `typescript` | `project root` | `typescript compiler options` |
| `package.json` | `npm` | `project root` | `npm packages and options` |
| `vite.config.mjs` | `vite` | `project root` | `vitest configuration` |


### Development Rules

- Use built in functionality where possible
- Prefer descriptive variable names
- Document all functions, methods and properties
- Document hard to understand lines
- Move commonly used functionality to utility functions

### Development Plan

1. `generate command file`
2. `stub out command`
3. `write failing tests`
4. `implement command`
5. `run tests`
6. `refactor until all tests pass`
7. `expand test coverage`
8. `refactor until all tests pass`
9. `refactor for readability, time complexity and space complexity`
10. `create or revise documentation`
11. `summarize the work done`
12. `submit for review`

## 8. Testing

### Test Cases

#### Happy Path

- **Fresh project, default paths**
  - Given: A project root with a valid `package.json` and no existing `src/i18n`, `res/l10n`, or `@worldware/msg` / `@worldware/msg-cli` dependencies.
  - When: User runs `msg init` with no flags.
  - Then: `src/i18n/projects`, `src/i18n/resources`, `res/l10n/translations`, and `res/l10n/xliff` are created; each leaf directory contains a `.gitkeep`; `package.json` has `directories.i18n`, `directories.l10n`, `directories.root`, `imports.#i18n/*`, `imports.#l10n/*`, `imports.#root/*`, and scripts `i18n-export` and `l10n-import`; latest `@worldware/msg` is installed as a dependency; actions are logged to STDOUT.

- **Custom i18n and l10n paths**
  - Given: A project root with a valid `package.json` and no existing i18n/l10n directories at the specified paths.
  - When: User runs `msg init --i18nDir lib/i18n --l10nDir data/l10n`.
  - Then: `lib/i18n/projects`, `lib/i18n/resources`, `data/l10n/translations`, and `data/l10n/xliff` are created with `.gitkeep` in leaf dirs; `package.json` has `directories.i18n` and `directories.l10n` set to those paths and imports/scripts use them; dependencies are installed; no prompts for paths.

- **TypeScript project: tsconfig paths**
  - Given: A project with a `tsconfig.json` at the root and no existing msg setup.
  - When: User runs `msg init`.
  - Then: In addition to default init outcomes, `tsconfig.json` has `compilerOptions.baseUrl` and `compilerOptions.paths` entries for `#i18n/*`, `#l10n/*`, and `#root/*` so intellisense and code navigation work.

- **Help**
  - Given: Any project directory.
  - When: User runs `msg init -h` or `msg init --help`.
  - Then: Help message for the init command is printed (no scaffolding or installs).

#### Edge Cases

- **Force overwrite existing msg setup**
  - Given: Project already has `@worldware/msg` installed, existing `src/i18n` and `res/l10n` trees, and existing `directories`/`imports`/`scripts` in `package.json`.
  - When: User runs `msg init -f` or `msg init --force`.
  - Then: Dependencies are (re)installed; directories are recreated or overwritten as needed; `package.json` entries are updated; no error due to “already exists”.

- **Force overwrite non-empty directory**
  - Given: `src/i18n` or `res/l10n` (or a subdirectory) already exists and contains files other than `.gitkeep`.
  - When: User runs `msg init --force`.
  - Then: Command proceeds (e.g. overwrites or merges as specified); no failure solely because directory is non-empty.

- **Interactive mode with no overrides**
  - Given: A project with valid `package.json`; user can provide input via stdin.
  - When: User runs `msg init -i` and, when prompted, accepts or enters default i18n and l10n paths.
  - Then: Same outcomes as default happy path; paths used match user input or defaults.

- **Interactive mode with one override**
  - Given: Same as above.
  - When: User runs `msg init -i --i18nDir custom/i18n` (no `--l10nDir`).
  - Then: Command does not prompt for i18n path; uses `custom/i18n` for i18n; prompts only for l10n path (if applicable); then scaffolds and updates `package.json` accordingly.

- **Already initialized (no force)**
  - Given: Project already has `directories.i18n` and `directories.l10n` in `package.json` and corresponding directories exist.
  - When: User runs `msg init` without `-f` or `--force`.
  - Then: Command does not overwrite existing msg installation or replace existing directories; may exit successfully with a message or skip redundant steps, or surface a clear “already initialized” warning without modifying existing setup.

- **Empty or minimal package.json**
  - Given: A `package.json` that exists but has no `directories`, `imports`, or `scripts` (or only some of these).
  - When: User runs `msg init`.
  - Then: Missing top-level keys are added; existing keys are extended with i18n/l10n/root and script entries without removing other existing entries.

#### Errors

- **No package.json**
  - Given: Current directory is not a project root, or `package.json` is missing.
  - When: User runs `msg init`.
  - Then: Command fails with a clear error (e.g. “package.json not found” or “must be run from project root”); nothing is installed or created; error is written to STDERR.

- **Invalid or unreadable package.json**
  - Given: `package.json` exists but is malformed (invalid JSON) or not readable.
  - When: User runs `msg init`.
  - Then: Command fails with an error describing invalid or unreadable `package.json`; no directories created; error on STDERR.

- **Directory creation failure**
  - Given: File system prevents creating directories (e.g. permission denied, path is a file, or disk full).
  - When: User runs `msg init` (with paths that would hit the failing location).
  - Then: Command fails with an error indicating the failure (e.g. permission or path conflict); partial directories may exist; error on STDERR.

- **npm install failure**
  - Given: Network unavailable, registry error, or npm otherwise fails to install `@worldware/msg` (or `@worldware/msg-cli`).
  - When: User runs `msg init`.
  - Then: Command fails with an error that reflects the install failure; user is informed that dependency installation failed; error on STDERR (and optionally STDOUT).

- **Invalid --i18nDir or --l10nDir**
  - Given: User passes `--i18nDir` or `--l10nDir` with an invalid value (e.g. absolute path when relative is required, or empty string, or path that cannot be created).
  - When: User runs `msg init` with that option.
  - Then: Command fails with a clear validation error; no partial scaffolding or overwrite; error on STDERR.

### Testing Environment

- `tmp` : `use a tmp folder for testing where possible`
- `vitest` : `use vitest for testing`

### Testing Rules

- Prefer fixtures over defining this inline in the test file
- Organize test cases in the same file by category and scenario

### Testing Plan

1. `setup` : `set up any required directories. ensure everything need for testing is installed.`
2. `fixtures` : `create any fixture required for testing`
3. `tests` : `run all tests and report results`
4. `cleanup` : `clean up fixture and directories used in testing`

### Test Coverage

- Lines : `99%`
- Functions : `99%`
- Branches: `99%`

## 9. Refactoring

### Readability

1. `documentation` : `make sure all methods, functions and properties are documented in the code`
2. `variable names` : `ensure variable names are clear and easy to understand`
3. `formatting` : `make sure code is formatted in a way that is easy to read`

### Time Complexity

1. `optimize` : `optimize algorithms to achieve minimal time complexity and maximum performance`
2. `explain` : `explain the changes made and why they optimize the code`

### Space Complexity

1. `optimize` : `optimize algorithms for space complexity and memory footprint`
2. `explain` : `explain the changes made and why they optimize the code`

## 10. Documentation

All documentation is to be kept in a README.md file at the project root for convenience. The README.md file should have the following sections.

- Headline
- Overview
- Installation
- Core Concepts
- Usage
- API Reference
- Development
- License
- Keywords

Use simple, easy to understand language.