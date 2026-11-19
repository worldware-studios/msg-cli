## 1. Summary

The `import` command extracts translations from **XLIFF 2.0 or 2.2** files and writes them to corresponding JSON files inside project name and locale directories inside `l10n/translations`. It writes a minimal JSON file in order to decrease size.

Unit `type` values `msg:NONE` / `msg:MF1` / `msg:MF2` (or bare format tokens) are restored as message `attributes.format`. For units that carry **PGS** attributes (`pgs:switch` / `pgs:case`), it reconstructs a single message string per key from the segments (using `<target>` text when present): **MF1** → ICU MessageFormat 1 (nested for multi-switch); otherwise → MessageFormat 2 `.match`. Legacy single-segment units behave unchanged.

**Important Note:** The `import` command involves a series of operations. The functionality for most of these operations has already been implemented in `utilities.ts`, but that functionality should be considered deprecated and should only be used as a reference. In this iteration, the functionality should be moved to command helper functions, like the other commands.

## 2. Context

### User Segments

- **Application Developers** : Developers writing an application that uses the `msg` library.
- **Localization Engineers** : Engineers responsible for importing resource translations.
- **CI/CD Developers** : Engineers responsible for CI/CD pipelines who want to automate localization.

### User Stories

- As an `application developer`, I want `to be able to import translations from xliff 2.0 files`, so that `I can use the translations`.
- As a `localization engineer`, I want `to be able to filter imports by project and language`, so that `I can deal with one-off use cases`.
- As a `CI/CD engineer`, I want `to be able to automate translation imports`, so that `I can integrate into the build and release processes`.

## 3. Functionality

### Primary Functions

- It `imports translations from xliff 2.0 to json` in order to `make them available for the application`

### Secondary Functions

- It `finds all xliff 2.0 files in the l10n/xliff directory` in order to `processs them`
- It `optionally filters xliff files by project` in order to support `scenarios when only one project should be imported`
- It `optionally filters xliff files by language` in order to support `scenarios when only on language should be imported`
- It `extracts target translations for xliff 2.0 files` in order to `create translated resources`
- It `serializes translated resources to JSON` in order to `make them accessible for run time or build time localization`

## 4. Behavior

### Requirements

- It `should import all resources and target languages by default`
- It `should error if it cannot read an xliff 2.0 file because it is malformed`
- It `should be based on the target text in the xliff`
- It `should handle any valid xliff 2.0 file`
- It `should transfer all relevant notes and attributes from the xliff to the MsgResource`
- It `should write JSON files without notes`
- It `should keep the user informed of what is doing`
- It `should preserve existing other resource translations in other languages, when filtering by language or project`
- It `must keep segment whitespace exactly when the inherited xml:space is preserve, and otherwise trim only leading and trailing XML whitespace (space, tab, CR, LF)`
- It `must decode numeric character references (e.g. &#13;, &#160;) in segment text`
- It `must rebuild segment text from inline elements in document order: pc, mrk, and unrecognized elements contribute their content; ph, sc, and ec contribute equiv, else disp, else nothing; cp contributes its code point (U+FFFD if invalid); sm and em contribute nothing`

### Constraints

- It `should not process monolingual xliff 2.0 files with no trgLang`
- It `must use the file's trgLang as its locale, and skip with a warning a file whose file name locale differs from trgLang (case-insensitive)`

## 5. Design

### Interface


| Command   | Arguments     | Flags           | Notes   |
| --------- | ------------- | --------------- | ------- |
| `import` | -- | `--project [projectName]` `--language [locale]` | imports translations from xliff 2.0, optionally filtering by project and/or language |


### Inputs


| Argument   | Type   | Required | Notes   |
| ---------- | ------ | -------- | ------- |
-- no arguments for this command --


### Options


| Option   | Type   | Short   | Long   | Notes   |
| -------- | ------ | ------- | ------ | ------- |
| `projectName` | `string` | `-p` | `--project` | Name of the project to filter by |
| `locale` | `string` | `-l` | `--language` | Locale code for the language to filter by |


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
| `translations` | `JSON files` | JSON files for MsgResource translation should be created in the correct directories |


## 6. Architecture

### Technologies


| Technology   | Development Only | Notes   |
| ------------ | ---------------- | ------- |
| `typescript` | `Y`            | programming language |
| `ocliff` | `Y`            | CLI framework |
| `fast-xml-parser` | `Y`            | XML parser library |
| `msg` | `Y`            | msg resource library |


### Components


| Component   | Notes   |
| ----------- | ------- |
| `import command` | User interface for importing translations |
| `xliff 2.0 files` | Stores source text and target translations received from translators  |
| `JSON files` | Stores extracted translations to be used at run time or build time |


### Operations

1. **Find xliff 2.0 files.** 
  - Recursively find all the xliff files in the `l10n/xliff` directory. Return an array of absolute paths.
2. **Filter files by project name (optional).** 
  - If `projectName` is passed to the `--project` flag, filter the array of paths to those whose file name parses to exactly `projectName` (`projectName.xliff` or `projectName.locale.xliff`, in any directory). This is the project step 4 loads, so directories are not matched, and names that only share a prefix (`projectName` vs `projectNameX`) are not selected. Also keep paths whose whole file name without the extension is `projectName` (a dotted name such as `my.app.xliff` for `my.app`). Step 4 may resolve such a file to another project; then skip it without writing.
3. **Filter files by locale (optional).**
  - If `locale` is passed to the `--language` flag, read and parse each file and keep those whose `trgLang` equals `locale` (compared case-insensitively), wherever they sit; the path is not consulted, since step 4 takes the locale from `trgLang`. Drop monolingual files (no `trgLang`). Keep files that cannot be parsed, so step 4 reports them as malformed.
4. **Extract translations**
  - Iterate through the array of filtered file paths to process them.
    - Determine the project from the file name (`project.locale.xliff` or `project.xliff`), and note the file name locale, if any.
    - Read and parse the xliff to an javascript object using `fast-xml-parser`
    - If there is no `trgLang` attribute on the xliff object, the file is monolingual: warn `Skipping monolingual file (no target locale): <path>` and continue to the next file path.
    - `trgLang` is the file's locale. If the file name has a locale that differs from `trgLang` (compared case-insensitively) and `i18n/projects` has a project named `<project>.<that locale>` (a dotted project name such as `my.app` for `my.app.xliff`), use that project and continue. Otherwise warn `Skipping <path>: file name locale '<locale>' does not match trgLang '<trgLang>'` and continue to the next file path. Directory names are not checked against `trgLang`: a directory such as `l10n/xliff/app/` would look like a locale code.
    - Use the project (the file name without the locale code, or the dotted project chosen above) to dynamically import the `MsgProject` object from the file with the same name in the `i18n/projects` directory
    - Get the array of target locales from the project, which correspond to the keys in the project's `locales.targets` object.
    - If `trgLang` is not in the target locales array, the language is not supported. Continue to the next file path.
    - Iterate through the file objects in the parsed xliff object in order to create new translated `MsgResource` objects.
      - Use the `original` attribute of the file object to extract the `title` from the file name. 
      - Use the `trgLang`, `trgDir`, and `translate` attributes to create an object of type `MsgAttributes`.
        - Default `dir` to `"auto"` when the file has no `trgDir`.
      - If there is `notes` object directly inside the `file` object, use it to create an array of `MsgNote` objects.
      - Use `MsgResource.create` with the information just gathered to create a new resource with an empty `messages` array
      - Recursively iterate through the file object's `unit` and `group` objects (if any) in order to add messages:
        - Create an attributes object of type `MsgAttributes`
        - Use the `trgLang` attribute to set the `lang` property on the object, if it exists.
        - Use the `trgDir` attribute to set the `dir` property on the object, if it exists.
        - If there is a `translate` attribute and it is set to `no`,  set the `dnt` property of the object to `true`.
        - If there are any `notes` associated with the `unit`, extract them to `MsgNote` objects using the uppercased category as the note `type`
        - Iterate through each `segment` in the `unit` and get the text for the segment translation for the `target` object.
        - Reconstruct the complete translated `value` from the collected segments, according to the xliff 2.0 specification rules. Treat segment text as already-decoded; do not pre-escape `\` before JSON serialization. Rebuild text from inline elements (`pc`, `mrk`, `ph`, `sc`, `ec`, `cp`, `sm`, `em`) in document order, per the inline element requirement above. Resolve `xml:space` by inheritance (xliff → file → group → unit → `source`/`target`, default `default`). Under `preserve`, keep the text exactly; under `default`, trim only leading and trailing XML whitespace. Notes are not trimmed specially: they are dropped from the written JSON. For PGS units, splice segment bodies into the reconstructed message without re-parsing them as MF2 (so `\n`, `\t`, `\{`, and `\\` survive). 
        - Use the `unit` element's `name` and the complete translated `value` for the unit, together with the `MsgAttribute` object and `MsgNote` array, to programmatically add a new message to the `MsgResource` created earlier.
    - Use MsgResource.toJSON(true) to get a serialized JSON string without notes.
    - Create a directory named after the project name inside `l10n/translations`, if it does not already exist
    - Create a directory inside the directory named after the project name that is named after the locale (`trgLang`), if it does not already exist
    - Write the serialized JSON string to a file inside the locale code directory. The file name should be the resource `title`, and the extension should be `.json`


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

- _[Scenario]_
  - Given:
  - When:
  - Then:

#### Edge Cases

- _[--language by trgLang]_
  - Given: `l10n/xliff/app.xliff` with `trgLang="zh"` and `l10n/xliff/zh/other.xliff` with `trgLang="de"`
  - When: the user runs `import --language zh`
  - Then: only `app.xliff` is imported

- _[Dotted project name]_
  - Given: projects `my` and `my.app`, and a bilingual `l10n/xliff/my.app.xliff` with `trgLang="zh"`
  - When: the user runs `import` (or `import --project my.app`)
  - Then: translations are written to `l10n/translations/my.app/zh/`, and `import --project my` writes nothing for this file

- _[--project with a shared prefix]_
  - Given: `l10n/xliff/app.zh.xliff` and `l10n/xliff/application.zh.xliff`
  - When: the user runs `import --project app`
  - Then: only `app.zh.xliff` is imported

- _[Preserved whitespace]_
  - Given: a unit with `xml:space="preserve"` (set on it or inherited from its file, group, or the xliff root) whose target is `"Total: "`
  - When: the user runs `import`
  - Then: the message value is `"Total: "`

- _[Default whitespace]_
  - Given: a unit without `xml:space` whose target is `"  Prix\u00A0:\u00A0  "`
  - When: the user runs `import`
  - Then: the message value is `"Prix\u00A0:\u00A0"` (ASCII spaces trimmed, non-breaking spaces kept)

- _[File name locale disagrees with trgLang]_
  - Given: `l10n/xliff/myApp.fr.xliff` with `trgLang="de"`
  - When: the user runs `import`
  - Then: the file is skipped with the warning `Skipping <path>: file name locale 'fr' does not match trgLang 'de'`, and nothing is written

- _[Locale from trgLang, not the directory]_
  - Given: `l10n/xliff/app/zh/myApp.xliff` (or `l10n/xliff/myApp.xliff`) with `trgLang="zh"`
  - When: the user runs `import`
  - Then: translations are written to `l10n/translations/myApp/zh/`

- _[Inline elements keep their order]_
  - Given: a target `Hello <pc id="1">bold</pc> and <pc id="2">more</pc>!`
  - When: the user runs `import`
  - Then: the message value is `Hello bold and more!`

- _[Placeholder equivalents]_
  - Given: a target `Hi <ph id="1" equiv="{name}"/>.`
  - When: the user runs `import`
  - Then: the message value is `Hi {name}.`; a `ph` with only `disp` uses that, and one with neither contributes nothing

- _[Closer xml:space wins]_
  - Given: a unit with `xml:space="preserve"` whose `<target>` has `xml:space="default"`
  - When: the user runs `import`
  - Then: the target text is trimmed

#### Errors

- _[Scenario]_
  - Given:
  - When:
  - Then:

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
