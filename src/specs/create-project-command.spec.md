## 1. Summary

The `create project` command creates a new `MsgProject` file in the `projects` subdirectory of the `i18n` directory in a project. The user supplies the `projectName`, `source` locales, and `target` locales for the project as arguments on the command line. The `targets` argument is variadic, so the `strict` option in the oclif generated template must be set to `false` and the   `projectName`, `source` and `targets` arguments must be destructured from the `args` array. The `MsgProject` file that the `create project` command creates should look like the following example.

```javascript
import { MsgProject } from `@worldware/msg`;

export default = MsgProject.create({
  project: {
    name: <projectName>,
    version: 1
  },
  locales: {
    sourceLocale: <source>,
    pseudoLocale: 'en-XA',
    targetLocales: {
      <source>: ['<source>'],
      <targets[0]>: ['<targets[0]>'],
      <targets[1]>: ['<targets[1]>']
    }
  },
  loader: <loaderFunction>
});

```

The loader function should use the following template, but `TRANSLATION_IMPORT_PATH` should be replaced with the relative path from the `i18n` directory's `projects` subdirectory to the `l10n` directory's `translations` subdirectory. This can be calculated from the `i18n` and `l10n` entries in the `directories` portion of the package.json file.

```javascript
const loader = async (project, title, language) => {
  const path = `${TRANSLATION_IMPORT_PATH}/${project}/${language}/${title}.json`;
  try {
    const module = await import(path, { with: {type: 'json'}});
    return module.default;
  } catch (error) {
    console.warn(`Translations for locale ${language} could not be loaded.`, error);
    return { 
      title, 
      attributes: { 
        lang: language, 
        dir: '' 
      },
       notes: [], 
       messages: []
      };
  }
}
```

When retrieving the path for the `i18n` and `l10n` directories from the package.json file, it is preferable to import the package.json file instead of reading and parsing it.

## 2. Context

### User Segments

- `Software Developers` : `Developers who want to quickly template a MsgProject file`

### User Stories

- As a `software developer`, I want to `be able to template a MsgProject file`, so that `I don't have to do it myself`.
- As a `software developer`, I want `the loader function to be automatically configured based on the relative path`, so that `I don't have to do it myself`.
- As a `software developer`, I want `the MsgProject file to use CommonJS or ES modules based on what is set in package.json`, so that `it fits into my project`.

## 3. Functionality

### Primary Functions

- It `templates a MsgProject file` in order to `be able to use the exported MsgProject instance when creating MsgResource files`.
- It `automatically creates and configures an translation import loader function` in order to `use it in the MsgProject files`

### Secondary Functions

- It `reads the i18n and l10n directories from package.json` in order to support `use them in constructing the loader function`
- It `calculates the relative path from i18n/projects to l10n/translations` in order to support `make the translation import loader work.`

## 4. Behavior

### Requirements

- It should adjust the module export syntax for the MsgProject file based on the settings in `package.json`
- It should error if the package.json file cannot be imported
- It should be compatible with node execution.
- It should use typescript for the MsgProject file if the surrounding project has a tsconfig.json file
- It should write all MsgProject files it creates to the `i18n/projects` directory using the project name as the file name.
- It should export a MsgProject instance from the module
- It should import the package.json file using the `with {type: JSON}` syntax
- It should log all activities to the console
- It should require all arguments be passed and error with a message if any are missing
- It should accecpt a flag `--extend` which takes the name of an existing project to extend
- It should merge the new data with the information from the existing project if `--extend` is used
- It should write an importable file.

### Constraints

- It must not replace an existing MsgProject file with the same name and exit with an error
- It should not use node-specific functions in the MsgProject file it writes (e.g., `fs`, `path`)

## 5. Design

### Interface


| Command   | Arguments     | Flags           | Notes   |
| --------- | ------------- | --------------- | ------- |
| `create project` | `<projectName>` `[source]` `[targets]` | `--extend=<existing project name>` | `creates a new MsgProject file in the projects dir` |

* Note: Do not include the angle brackets above in the argument names. `source` and `targets` are optional when `--extend` is used; they are inherited from the base project.

### Inputs


| Argument   | Type   | Required | Notes   |
| ---------- | ------ | -------- | ------- |
| `projectName` | `string` | `Y`    | `Name of the project to be created. Also used for file name` |
| `source` | `string` | `Y*`    | `source locale for the project` |
| `targets` | `string array (variadic)` | `Y*`    | `array of target locales for the project` |

* When `--extend` is passed, `source` and `targets` are optional and inherited from the base project.


### Options


| Option   | Type   | Short   | Long   | Notes   |
| -------- | ------ | ------- | ------ | ------- |
| `extend` | `string` | `-e` | `--extend` | `Used to extend an existing project` |


### Outputs


| Output   | Type   | Notes   |
| -------- | ------ | ------- |
| `STDOUT` | `log` | `Logs should be written to STDOUT` |
| `STDERR` | `errors` | `Errors should be written to STDERR` |
| `STDOUT` | `warning` | `Warning should be written to STDOUT with console.warn` |


### Outcomes


| Outcome   | Type   | Notes   |
| --------- | ------ | ------- |
| `MsgProject file is created` | `file` | `It creates an MsgProject file in the i18n projects dir` |
| `Import loader function is created` | `file` | `It uses the relative path from the projects dir to the translations dir` |


## 6. Architecture

### Technologies


| Technology   | Development Only | Notes   |
| ------------ | ---------------- | ------- |
| `msg` | `n`            | `It requires the msg library` |


### Components


| Component   | Notes   |
| ----------- | ------- |
| `TRANSLATION_IMPORT_PATH` | `notes` |
| `translation import loader function` | `notes` |
| `project settings` | `project settings in MsgProjectData` |
| `locales settings` | `locales settings in MsgProjectData` |
| `loader settings` | `loader settings in MsgProjectData` |


### Operations / Helpers


| Operation   | Notes   |
| ----------- | ------- |
| `calculateRelativePath` | `helper to calculate relative path from projects to translations dir` |
| `importMsgProjectFile` | `helper to import MsgProjectFile` |
| `writeMsgProjectFile` | `helper to write a MsgProjectFile` |


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
2. `stub out command and helpers`
3. `write failing tests`
4. `implement command`
5. `run tests`
6. `refactor until all tests pass`
7. `expand test coverage`
8. `refactor until all tests pass`
9. `refactor for readability, time complexity and space complexity`
10. `create or update documentation`
11. `summarize the work done`
12. `submit for review`

## 8. Testing

### Test Cases

#### Happy Path

- **Basic project creation with single target**
  - Given: A project root with a valid `package.json` containing `directories.i18n` and `directories.l10n`, and an existing `i18n/projects` directory.
  - When: User runs `msg create project myApp en fr`.
  - Then: An MsgProject file is created at `i18n/projects/myApp.ts` (or `.js` based on project config) with correct `project.name`, `sourceLocale`, `targetLocales` (en and fr), and a loader function using the calculated relative path from `i18n/projects` to `l10n/translations`; actions are logged to STDOUT; the file exports a MsgProject instance and is importable.

- **Project creation with multiple target locales**
  - Given: Same as above.
  - When: User runs `msg create project myApp en fr de es`.
  - Then: An MsgProject file is created with `targetLocales` including en, fr, de, and es; each target has its corresponding entry in `targetLocales`; file is valid and importable.

- **ES module project**
  - Given: A project with `"type": "module"` in `package.json` and `directories.i18n` / `directories.l10n` configured.
  - When: User runs `msg create project myApp en fr`.
  - Then: The created MsgProject file uses ES module syntax (`export default`); file is importable as an ES module.

- **CommonJS project**
  - Given: A project without `"type": "module"` (or with `"type": "commonjs"`) and `directories.i18n` / `directories.l10n` configured.
  - When: User runs `msg create project myApp en fr`.
  - Then: The created MsgProject file uses CommonJS syntax (`module.exports`); file is importable as CommonJS.

- **TypeScript project**
  - Given: A project with a `tsconfig.json` at the root and `directories.i18n` / `directories.l10n` configured.
  - When: User runs `msg create project myApp en fr`.
  - Then: The MsgProject file is written with `.ts` extension and TypeScript-compatible syntax; file is importable.

- **JavaScript project (no tsconfig)**
  - Given: A project without `tsconfig.json` and with `directories.i18n` / `directories.l10n` configured.
  - When: User runs `msg create project myApp en fr`.
  - Then: The MsgProject file is written with `.js` extension; file uses JavaScript syntax and is importable.

- **Extend existing project**
  - Given: An existing MsgProject file at `i18n/projects/base.ts` with defined project, locales, and loader settings.
  - When: User runs `msg create project extendedApp en de --extend base`.
  - Then: A new MsgProject file is created at `i18n/projects/extendedApp.ts`; the new file merges data from `base` with the new project name and target locales; loader and other settings from the base project are preserved where appropriate; actions are logged to STDOUT.

- **Extend existing project without source or targets**
  - Given: An existing MsgProject file at `i18n/projects/base.ts` with defined project, locales, and loader settings.
  - When: User runs `msg create project extendedApp --extend base` (no source or targets).
  - Then: A new MsgProject file is created at `i18n/projects/extendedApp.ts`; source locale and target locales are inherited from the base project; actions are logged to STDOUT.

- **Help**
  - Given: Any project directory.
  - When: User runs `msg create project -h` or `msg create project --help`.
  - Then: Help message for the create project command is printed (no file creation).

#### Edge Cases

- **Custom i18n and l10n paths in package.json**
  - Given: A project with `directories.i18n` set to `lib/i18n` and `directories.l10n` set to `data/l10n`, with corresponding directories existing.
  - When: User runs `msg create project myApp en fr`.
  - Then: The MsgProject file is created in `lib/i18n/projects/myApp.ts`; the loader's `TRANSLATION_IMPORT_PATH` correctly resolves the relative path from `lib/i18n/projects` to `data/l10n/translations`.

- **Source locale same as one target**
  - Given: A valid project setup.
  - When: User runs `msg create project myApp en en fr` (source en, targets including en).
  - Then: The MsgProject file is created with correct `sourceLocale` and `targetLocales`; the source locale appears in `targetLocales` as specified; file is valid.

- **Single target locale**
  - Given: A valid project setup.
  - When: User runs `msg create project myApp en fr` (minimal: one source, one target).
  - Then: The MsgProject file is created with `targetLocales` containing only fr; file structure is valid.

#### Errors

- **Missing projectName**
  - Given: A valid project setup.
  - When: User runs `msg create project` (no arguments) or `msg create project "" en fr`.
  - Then: Command fails with a clear error indicating that projectName is required; no file is created; error is written to STDERR.

- **Missing source locale (without --extend)**
  - Given: A valid project setup.
  - When: User runs `msg create project myApp` or `msg create project myApp "" fr` (without `--extend`).
  - Then: Command fails with a clear error indicating that source is required; no file is created; error on STDERR.

- **Missing target locales (without --extend)**
  - Given: A valid project setup.
  - When: User runs `msg create project myApp en` (no targets, without `--extend`).
  - Then: Command fails with a clear error indicating that at least one target locale is required; no file is created; error on STDERR.

- **Package.json not found or not importable**
  - Given: Current directory has no `package.json`, or `package.json` is malformed/unreadable.
  - When: User runs `msg create project myApp en fr`.
  - Then: Command fails with an error describing that package.json could not be imported; no file is created; error on STDERR.

- **Existing MsgProject file with same name**
  - Given: An MsgProject file already exists at `i18n/projects/myApp.ts`.
  - When: User runs `msg create project myApp en fr`.
  - Then: Command exits with an error indicating that a project with that name already exists; the existing file is not replaced; error on STDERR.

- **Extend non-existent project**
  - Given: No MsgProject file exists for the specified name.
  - When: User runs `msg create project myApp en fr --extend nonexistent`.
  - Then: Command fails with an error indicating that the project to extend could not be found; no file is created; error on STDERR.

- **i18n or l10n directories not configured**
  - Given: A `package.json` that lacks `directories.i18n` or `directories.l10n` entries.
  - When: User runs `msg create project myApp en fr`.
  - Then: Command fails with an error indicating that required directory configuration is missing; no file is created; error on STDERR.

### Testing Environment

- `tmp` : `use a tmp folder for testing where possible`
- `vitest` : `use vitest for testing`

### Testing Rules

- Prefer fixtures over defining things inline in the test file
- Organize test cases in the same file by category and scenario

### Testing Plan

1. `setup` : `set up any required directories. ensure everything need for testing is installed.`
2. `fixtures` : `create any fixtures required for testing`
3. `tests` : `run all tests and report results`
4. `cleanup` : `clean up fixture and directories used in testing`

### Test Coverage

- Lines : `99%`
- Functions : `99%`
- Branches: `99%`

## 9. Refactoring

### Readability

1. `documentation` : `make sure all methods, functions and properties are properly documented in the code`
2. `variable names` : `ensure variable names are clear and easy to understand`
3. `formatting` : `make sure code is formatted in a way that is easy to read`

### Time Complexity

1. `optimize` : `optimize algorithms to achieve minimal time complexity and maximum performance`
2. `explain` : `explain the changes made and why they optimize the code`

### Space Complexity

1. `optimize` : `optimize algorithms for space complexity and memory footprint`
2. `explain` : `explain the changes made and why they optimize the code`

## 10. Documentation

All documentation is to be kept in a `README.md` file at the project root for convenience. The `README.md` file should have the following sections. Section names are in bold.

- **Headline** : A very brief description of what `msg-cli` is and what it does
- **Overview** : Description of features
- **Installation** : Installation instructions
- **Core Concepts**: Important things to know
- **Usage** : How to use the CLI
- **Command Reference** : How to execute each command with options
- **Development** : Development instructions
- **License** : Reference to license file
- **Keywords** : Keywords that describe the package.

Use simple, easy to understand language.