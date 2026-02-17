## 1. Summary

The `export` command serializes MsgResource objects, on a project-by-project basis, to XLIFF 2.0 files suitable for translation. The command **does not send** the XLIFF files for translation. The msg system is  agnostic in terms of the mechanism used to translate these files. XLIFF was chosen because it is a standard format for localization exchange, and the 2.0 version is capable of preserving all the attributes and notes in an `MsgResource` or `MsgMessage` object.

**Important Note:** The `export` command involves a series of operations. The functionality for most of these operations has already implemented in `utilities.ts`, but that functionality should be considered deprecated and should only be used as a reference. In this iteration, the functionality should be moved to command helper functions, like the other commands.

## 2. Context

### User Segments

- **Application Developers** : Developers writing an application that uses the `msg` library.
- **Localization Engineers** : Engineers responsible for collecting and translating resource files.
- **CI/CD Developers** : Engineers responsible for CI/CD pipelines who want to automate localization.

### User Stories

- As an `application developer`, I want `the ability to export all resources with a single command`, so that `extracting text for localization is easy`.
- As a `application developer`, I want `to be able to filter an export of resources to a single project`, so that `I can handle one-off exports`.
- As a `localization engineer`, I want `to use an industry standard localization exchange format`, so that `it is compatible with the majority of translation services and tools`.
- As a `CI/CD engineer`, I want `to be able to automate the localization proces`, so that `it doesn't need to be done manually`.

## 3. Functionality

### Primary Functions

- It `exports MsgResource objects to XLIFF 2.0 files` in order to `make resources available for translation`

### Secondary Functions

- It `recursively finds all MsgResource files in a project` in order to `import the MsgResource objects`
- It `imports the MsgResource objects` in order to `group them by their associated project`
- It `groups the MsgResource objects by project` in order to `serialize them to XLIFF 2.0 strings`
- It `serializes the MsgResource object arrays to XLIFF 2.0 strings` in order to `write them to files in the l10n/xliff directory`

## 4. Behavior

### Requirements

- It `must recursively find all MsgResource files inside the i18n/resources directory`
- It `must import valid MsgResource objects using a filepaths`
- It `must group MsgResource objects by project name`
- It `should filter MsgResource objects by project name when the --project flag is used`
- It `should error if a MsgResource object cannot be imported`
- It `should exit with a message if no MsgResource files are found`
- It `should output a valid XLIFF 2.0 file`
- It `should console log each major step in the process to keep the user informed`

### Constraints

- It `must not clear the l10n/resources directory when filtering to just one project`
- It `must not error if no files are found, exiting instead with a message`

## 5. Design

### Interface


| Command   | Arguments     | Flags           | Notes   |
| --------- | ------------- | --------------- | ------- |
| `export` | -- | `--project [projectName]`| serializes all msg resources in the `i18n/resources` directory to xliff 2.0 files in the `l10n/xliff` directory on a per project basis |


### Inputs


| Argument   | Type   | Required | Notes   |
| ---------- | ------ | -------- | ------- |

-- no arguments --


### Options


| Option   | Type   | Short   | Long   | Notes   |
| -------- | ------ | ------- | ------ | ------- |
| `projectName` | `string` | `-p` | `--project` | Filters the export to just the single named project |


### Outputs


| Output   | Type   | Notes   |
| -------- | ------ | ------- |
| `STDOUT` | `LOG` | Actions should be logged to the console |
| `STDOUT` | `INFO` | Information should be logged to the console |
| `STDOUT` | `WARN` | Warnings should be logged to the console |
| `STDERR` | `ERROR` | Errors should be sent to STDERR |


### Outcomes


| Outcome   | Type   | Notes   |
| --------- | ------ | ------- |
| `xliff 2.0` | `file` | An xliff 2.0 for each project should be output to `l10n/xliff` |


## 6. Architecture

### Technologies


| Technology   | Development Only | Notes   |
| ------------ | ---------------- | ------- |
| `typescript` | `Y`            | programming language |
| `ocliff` | `n`            | CLI framework |
| `fast-xml-parser` | `n`            | XML parser formatter library |


### Components


| Component   | Notes   |
| ----------- | ------- |
| `resource group object` | an object use to group resources in an array along with their associate project name |
| `xliff group object` | an object use to group an xliff string with their associate project name that will be used for the filename |


### Operations

1. Recursively find all the `MsgResource` files inside the `i18n/resources` directory, and return an array of paths for these files.
2. Dynamically import the `MsgResource` objects using the array of file paths, and return an array of `MsgResource` objects.
3. Group the `MsgResource` objects by their associated `MsgProject` project name, and return an array of objects with type `{ project: string, resources: MsgResource[] }`
4. If the `--project [projectName]` filter out the objects where the `project` property does not match `projectName`. Return the filtered array.
5. Serialize each `resources` array to an XLIFF 2.0 string, and return an array of objects with type `{project: string, xliff: string}`
6. Iterate through the array of objects, writing each `xliff` string to a file in the `l10n/xliff` directory that has the `project` name as the filename.

## 7. Implementation

### Environment Variables

**no evironment variables required**

### Configurations


| Configuration   | Type   | Location   | Notes   |
| --------------- | ------ | ---------- | ------- |
| `tsconfig.json` | `typescript` | `project root` | typescript compiler options |
| `package.json` | `npm` | `project root` | npm packages and options |
| `vite.config.mjs` | `vite` | `project root` | vitest configuration |


### Development Rules

- Use built in functionality where possible
- Prefer descriptive variable names
- Document all functions, methods and properties
- Document hard to understand lines
- Move commonly used functionality to utility functions

### Development Plan

1. generate command file using oclif generate:command command
2. stub out command and command helper functions. do not implement.
3. write failing unit tests for command helper functions. do not modify function stubs.
4. implement command helper functions, iterating until all unit tests pass.
5. implement command using helper functions
6. write integration tests for command.
7. refactor command logic and helper functions until all tests pass.
8. analyze code coverage, and refactor tests to achieve target levels
9. analyze code for readability, time complexity and space complexity. report results.
10. if needed, refactor code to optimize readibility and complexity. Make sure tests all still pass.
11. Create or update README.md based on [Documentation](#10-documentation) section.
12. Summarize the work done and submit to the user for review.

## 8. Testing

### Test Cases

#### Happy Path

- _[Export all resources to XLIFF]_
  - Given: a project with `i18n/resources` containing one or more valid MsgResource files across one or more projects, and `l10n/xliff` exists or can be created
  - When: the user runs `export` with no flags
  - Then: all MsgResource files are found, imported, grouped by project, serialized to valid XLIFF 2.0, written to `l10n/xliff` (one file per project), and each major step is logged to the console

- _[Export filtered to a single project]_
  - Given: a project with `i18n/resources` containing valid MsgResource files for multiple projects (e.g. `projectA`, `projectB`)
  - When: the user runs `export --project projectA`
  - Then: only resources for `projectA` are exported, one XLIFF file for `projectA` is written to `l10n/xliff`, other projects' files in `l10n/xliff` are not cleared, and steps are logged

- _[Recursive discovery of resources]_
  - Given: `i18n/resources` with MsgResource files in nested subdirectories
  - When: the user runs `export`
  - Then: all MsgResource files under `i18n/resources` (including nested) are found, imported, grouped by project, and exported to XLIFF in `l10n/xliff`

#### Edge Cases

- _[No MsgResource files found]_
  - Given: a project where `i18n/resources` exists but contains no MsgResource files (or the directory is empty)
  - When: the user runs `export`
  - Then: the command exits with an informational message (not an error), does not write any files, and does not throw

- _[--project with no matching resources]_
  - Given: a project with MsgResource files only for projects `projectA` and `projectB`
  - When: the user runs `export --project projectC`
  - Then: the command exits with an appropriate message (no matching project), does not write new XLIFF files for `projectC`, and does not clear existing files in `l10n/xliff`

- _[Single project, single resource file]_
  - Given: `i18n/resources` contains exactly one MsgResource file for one project
  - When: the user runs `export`
  - Then: one XLIFF file is written to `l10n/xliff` with the correct project name as filename, and the output is valid XLIFF 2.0

- _[Multiple resources in one project]_
  - Given: `i18n/resources` contains multiple MsgResource files that all belong to the same project
  - When: the user runs `export`
  - Then: one XLIFF file is produced for that project containing all messages from those resources, and the file is valid XLIFF 2.0

- _[l10n/xliff directory does not exist]_
  - Given: a project with valid MsgResource files in `i18n/resources` but no `l10n/xliff` directory
  - When: the user runs `export`
  - Then: `l10n/xliff` is created (or the write path is created), and XLIFF files are written successfully

#### Errors

- _[Invalid or unimportable MsgResource file]_
  - Given: `i18n/resources` contains at least one file that cannot be imported as a valid MsgResource (e.g. malformed, wrong shape, syntax error)
  - When: the user runs `export`
  - Then: the command errors, an error message is sent to STDERR describing the failure, and no XLIFF files are written (or only those for successfully imported resources, per requirement "should error if a MsgResource object cannot be imported")

- _[i18n/resources directory missing]_
  - Given: a project where `i18n/resources` does not exist
  - When: the user runs `export`
  - Then: the command exits with a clear message (error or info) and does not throw an unhandled exception

- _[Import throws during dynamic import]_
  - Given: a MsgResource file path that causes dynamic import to throw (e.g. module not found, runtime error in module)
  - When: the export process attempts to import that file
  - Then: the error is caught, reported to STDERR, and the command exits with a non-zero status (or exits with message per requirements)

### Testing Environment

- `tmp` : use a tmp folder for testing where possible
- `vitest` : use vitest for testing
- `mocks` : mock external functionality where appropriate

### Testing Rules

- Prefer `fixtures` over defining things inline in the test file
- Organize test cases in the same file by `category` and `scenario`

### Testing Plan

1. `setup environment` : set up any required directories. ensure everything need for testing is installed.
2. `create fixtures` : create any fixtures required for testing
3. `run tests` : run all tests and report results
4. `cleanup environment` : remove any fixtures and directories used in testing

### Test Coverage

- **Statements** : 99%
- **Branches** : 99%
- **Functions** : 99%
- **Lines** : 99%

## 9. Refactoring

### Readability

1. **documentation** : make sure all methods, functions and properties are properly documented in the code, as well as any difficult to understand lines of code.
2. **variable names** : ensure variable names are clear and easy to understand
3. **formatting** : make sure code is formatted in a way that is easy to read

### Time Complexity

1. **optimize** : optimize algorithms to achieve minimal time complexity and maximum performance
2. **explain** : explain the changes made and why they optimize the code

### Space Complexity

1. **optimize** : optimize algorithms for space complexity and memory footprint
2. **explain** : explain the changes made and why they optimize the code

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

## 11. References

- [OCLIF Documentation](https://oclif.io/docs/introduction.html)
- [MSG Documentation](https://github.com/worldware-studios/msg#readme) or use README in local msg repository.
- [XLIFF 2.0 Specification](https://docs.oasis-open.org/xliff/xliff-core/v2.0/xliff-core-v2.0.html)
