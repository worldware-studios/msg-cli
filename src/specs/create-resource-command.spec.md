## 1. Summary

The `create resource` command creates a `MsgResource` file in the `resources` subdirectory of the `i18n` created by the `init` command. Running the `init` command is a prerequisite to running the `create resource` command. An `MsgResource` file is a javascript or typescript file that exports a `MsgResource` instance. These files have `.msg.` right before the file extension, and are named after the resource `title`. For example, `messages.msg.js`. The `create resource` command should create a file that exports a minimal `MsgResource` instance, using the `projectName` and `title` arguments passed to the command. The `projectName` argument is used to reference the project file in the `i18n/projects` subdirectory. Project files use the project name as the file name, so the correct file to reference in the `MsgResource` import can be easily determined. The generated `MsgResource` file should look like approximately like this:

```javascript
import { MsgResource } from '@worldware/msg';
import project from '../projects/<projectName>';

export default MsgResource.create({
  title: <title>,
  attributes: {
    lang: <project.locales.sourceLocale>,
    dir: <'rtl' or 'ltr'>
  },
  notes: [
    { type: 'DESCRIPTION', content: 'This is a generated file. Replace this description with your own.'}
  ],
  messages: [
    {
      key: 'example.message',
      value: 'Example message.'
      notes: [
        { type: 'DESCRIPTION', content 'This is an example message. You can delete it.' }
      ]
    }
  ]
}, project);
```
The terms in angle brackets `<>` above are variables to be replaced with the actual values. If the sourceLocale uses `ar` or `he` as the language subtag, set `dir` to `'rtl'`. Otherwise, it should be set to `''ltr'` by default.

The resulting file should be importable either as the default export of an ES module or as the main export of a CommonJS module. Which module format is used should depend on the module type being used in the surrounding project. If the project is using typescript, create a typescript file, but the content of that file would be no different from a javascript file.

The general order of operations for the command happy path should be as follows:

1. Parse the command and arguments
2. Locate the i18n directory and identify the module type from `package.json`
3. Import the project file associated with the `projectName` argument from the `i18n/projects` directory. 
4. Retrieve the sourceLocale from the project `locales` settings.
5. Create a template string based on the code above that inserts the necessary variable values.
6. Write the string to file in the `i18n/resources` directory, using the pattern: `<title>.msg.<ext>` 

## 2. Context

### User Segments

- **Application Developers** : Developers building a localized application using `msg` library and `msg-cli`

### User Stories

- As a `Application Developer`, I want `to quickly scaffold a resource file`, so that `I do not have to do it myself`.
- As a `Application Developer`, I want `the option to automatically open the file`, so that `I can quickly start editing it`.

## 3. Functionality

### Primary Functions

- It `creates a MsgResource file in the i18n/resources directory` in order to `make it easy to start defining a MsgResource`.
- It `associates every MsgResource with a MsgProject` in order to `pass on the project configuration to the resource and facilitate export to xliff`.

### Secondary Functions

- It `imports the package.json file and gets the location of the i18n directory` in order to `know where to create the MsgResource file`
- It `imports the package.json file and gets the module type` in order to `determine what module type to use for the generated file`
- It `retrieves the sourceLocale from the MsgProject instance` in order to `set the language on the MsgResource file`
- It `tries to calculate the base direction (dir) based on the language subtag` in order to `set the direction on the MsgResource file`
- It `creates a template string for a minimal MsgResource file` in order to `produce the content for the MsgResource file`
- It `determines the module type of the surrounding project` in order to `produce the correct export syntax for the generated content`
- It `writes the generated content to a file named after the title followed .msg.` in order to `persist the MsgResource`

## 4. Behavior

### Requirements

- It `must` generate a valid, importable MsgResource file. 
- It `must` throw an error if the file cannot be generated.
- It `must` validate that the file is valid and importable, throwing an error if it is not.
- It `must` be able to work on different platforms.
- It `must` name the generated file using the `title` argument.
- It `should` produce a typescript file if a `tsconfig.json` file is present.
- It `should` error if the `i18n/projects` or `i18n/resources` directories do not exist and prompt to run the `init` command.
- It `should` error if the `projectName` or `title` arguments are not provided.
- It `should` provide an option to open the MsgResource file after it is created.

### Constraints

- It `must not` replace an existing MsgResource file unless the force option is passed.
- It `should not` use any platform-specific functionality (be cross-platform)

## 5. Design

### Interface


| Command   | Arguments     | Flags           | Notes   |
| --------- | ------------- | --------------- | ------- |
| `create resource` | `projectName` `title` | `-f` `--force` `-e` `--edit` | Creates a MsgResource file name `title.msg` that imports the project `projectName` |


### Inputs


| Argument   | Type   | Required | Notes   |
| ---------- | ------ | -------- | ------- |
| `projectName` | `string` | `Y`    | Name of the project to import in the MsgResource file |
| `title` | `string` | `Y`    | Title of the resource and file name for the file |


### Options


| Option   | Type   | Short   | Long   | Notes   |
| -------- | ------ | ------- | ------ | ------- |
| `force` | `boolean` | `-f` | `--force` | Must be passed to overwrite an existing resource. |
| `edit` | `boolean` | `-e` | `--edit` | Open the file for editing after creation. |


### Outputs


| Output   | Type   | Notes   |
| -------- | ------ | ------- |
| `STDOUT` | `log` | Logging should be done to the STDOUT. |
| `STDERR` | `error` | Errors should be passed to STDERR. |
| `STDOUT` | `warnings` | Warning should be logged to the console with console.warn. |


### Outcomes


| Outcome   | Type   | Notes   |
| --------- | ------ | ------- |
| `Valid MsgResource File` | `file` | File successfully written to `i18n/resources` |


## 6. Architecture

### Technologies


| Technology   | Development Only | Notes   |
| ------------ | ---------------- | ------- |
| `oclif` | `N`            | CLI framework being used |
| `modules` | `N`            | ES or CJS modules |
| `fs` | `N`            | For reading and writing files |
| `path` | `N`            | For resolving paths |


### Components


| Component   | Notes   |
| ----------- | ------- |
| `commands/create/resource.ts` | Command file generated by `oclif generate:command` |
| `lib/create-resource-helpers.ts` | Helper functions used by command |


### Operations / Helpers


| Operation   | Notes   |
| ----------- | ------- |
| `readPackageJson` | Used to get i18n directory and module type |
| `importMsgProject` | Used to retrieve sourceLocale and calculate dir |
| `writeMsgResourceFile` | Used to write generated content to file |


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

- _[Create resource in ES module project]_
  - Given: A project with `init` run, `package.json` with `"type": "module"`, and a project file `i18n/projects/myProject.js`
  - When: User runs `create resource myProject messages`
  - Then: A file `i18n/resources/messages.msg.js` is created with valid MsgResource content, correct `title`, import from `../projects/myProject`, and default `dir: 'ltr'` for non-RTL sourceLocale.

- _[Create resource in CommonJS project]_
  - Given: A project with `init` run, `package.json` without `"type": "module"` (or `"type": "commonjs"`), and a project file in `i18n/projects`
  - When: User runs `create resource myProject messages`
  - Then: A file `i18n/resources/messages.msg.cjs` (or appropriate CJS extension) is created with CommonJS-compatible export and valid MsgResource content.

- _[Create resource produces TypeScript when tsconfig present]_
  - Given: A project with `init` run, `tsconfig.json` at project root, and a project file in `i18n/projects`
  - When: User runs `create resource myProject messages`
  - Then: A file `i18n/resources/messages.msg.ts` is created with valid MsgResource content and correct TypeScript syntax.

- _[Create resource sets dir to RTL for Arabic sourceLocale]_
  - Given: A project with `init` run and a project file whose `locales.sourceLocale` is `ar` or `ar-*`
  - When: User runs `create resource myProject messages`
  - Then: The generated MsgResource file includes `dir: 'rtl'` in `attributes`.

- _[Create resource sets dir to RTL for Hebrew sourceLocale]_
  - Given: A project with `init` run and a project file whose `locales.sourceLocale` is `he` or `he-*`
  - When: User runs `create resource myProject messages`
  - Then: The generated MsgResource file includes `dir: 'rtl'` in `attributes`.

- _[Create resource sets dir to LTR for other locales]_
  - Given: A project with `init` run and a project file whose `locales.sourceLocale` is `en` or `fr`
  - When: User runs `create resource myProject messages`
  - Then: The generated MsgResource file includes `dir: 'ltr'` in `attributes`.

- _[Create resource with --edit opens file after creation]_
  - Given: A project with `init` run and a project file in `i18n/projects`
  - When: User runs `create resource myProject messages --edit`
  - Then: The resource file is created and the file is opened for editing (e.g. via configured editor).

- _[Create resource with --force overwrites existing file]_
  - Given: A project with `init` run and an existing `i18n/resources/messages.msg.js`
  - When: User runs `create resource myProject messages --force`
  - Then: The existing file is overwritten with the generated MsgResource content and the command succeeds.

- _[Generated file is valid and importable]_
  - Given: A project with `init` run and a project file in `i18n/projects`
  - When: User runs `create resource myProject messages`
  - Then: The written file can be imported as default export (ES) or main export (CJS) and exports a valid MsgResource instance.

#### Edge Cases

- _[Title used as filename with safe naming]_
  - Given: A project with `init` run and a project file in `i18n/projects`
  - When: User runs `create resource myProject my-messages` or `create resource myProject my_messages`
  - Then: The file is created as `i18n/resources/my-messages.msg.<ext>` (or `my_messages.msg.<ext>`) with content `title: 'my-messages'` (or matching title).

- _[Project name matches exactly one project file]_
  - Given: `i18n/projects/app.js` and `i18n/projects/other.js` exist
  - When: User runs `create resource app dashboard`
  - Then: The generated file imports from `../projects/app` and no ambiguity error occurs.

- _[Source locale with compound tag still drives RTL]_
  - Given: A project file with `locales.sourceLocale` set to `ar-SA` or `he-IL`
  - When: User runs `create resource myProject messages`
  - Then: The generated file includes `dir: 'rtl'` because the language subtag is `ar` or `he`.

- _[Create resource when i18n path is not cwd]_
  - Given: package.json (or config) specifies an i18n directory path that is not the current working directory
  - When: User runs `create resource myProject messages` from project root
  - Then: The command locates the i18n directory, finds the project, and writes to the correct `i18n/resources` path.

- _[Short and minimal projectName and title]_
  - Given: A project with `init` run
  - When: User runs `create resource p t`
  - Then: A file `i18n/resources/t.msg.<ext>` is created with `title: 't'` and project import from `../projects/p`, and the file is valid.

#### Errors

- _[Missing projectName]_
  - Given: A project with `init` run
  - When: User runs `create resource` (no projectName) or `create resource '' myTitle`
  - Then: Command errors with a message to STDERR indicating projectName is required (and suggests running init if relevant).

- _[Missing title]_
  - Given: A project with `init` run
  - When: User runs `create resource myProject` (no title) or `create resource myProject ''`
  - Then: Command errors with a message to STDERR indicating title is required.

- _[i18n directory does not exist]_
  - Given: A project where the i18n directory (from package.json or config) does not exist
  - When: User runs `create resource myProject messages`
  - Then: Command errors with a message to STDERR and prompts the user to run the `init` command.

- _[i18n/projects directory does not exist]_
  - Given: An `i18n` directory exists but `i18n/projects` does not
  - When: User runs `create resource myProject messages`
  - Then: Command errors with a message to STDERR and prompts the user to run the `init` command.

- _[i18n/resources directory does not exist]_
  - Given: `i18n` and `i18n/projects` exist but `i18n/resources` does not
  - When: User runs `create resource myProject messages`
  - Then: Command errors with a message to STDERR and prompts the user to run the `init` command.

- _[projectName has no matching project file]_
  - Given: `i18n/projects` exists but has no file matching the given projectName (e.g. user passes `create resource nonexistent messages`)
  - When: User runs `create resource nonexistent messages`
  - Then: Command errors with a message to STDERR indicating the project was not found or could not be loaded.

- _[Resource file already exists without --force]_
  - Given: `i18n/resources/messages.msg.js` already exists
  - When: User runs `create resource myProject messages` (without `--force`)
  - Then: Command errors with a message to STDERR and does not overwrite the file; the existing file is unchanged.

- _[Project file fails to load or has invalid structure]_
  - Given: A project file in `i18n/projects` that throws when imported or does not expose a valid project (e.g. missing `locales.sourceLocale`)
  - When: User runs `create resource myProject messages`
  - Then: Command errors with a message to STDERR and does not create the resource file.

- _[Generated file cannot be written]_
  - Given: `i18n/resources` exists but is not writable (e.g. permissions) or disk write fails
  - When: User runs `create resource myProject messages`
  - Then: Command errors with a message to STDERR indicating the file could not be generated.

- _[Generated file is invalid or not importable]_
  - Given: Post-write validation is performed (per requirement: "validate that the file is valid and importable")
  - When: The written file fails validation or cannot be imported
  - Then: Command throws an error and ideally cleans up or reports that the file is not valid/importable.

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
- [XLIFF 1.2 Specification](https://docs.oasis-open.org/xliff/v1.2/os/xliff-core.html)
