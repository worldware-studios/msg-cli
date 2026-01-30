# Specification: Utility Functions

Specification for  `msg-cli` utility functions. 

---

## Overview

**Module/feature:** utilities

**Purpose:** Create a library of utility functions that can be used by the `export` and `import` commands to support export and import workflows. These workflows will be defined in the commands, but will rely on functionality from the utilities library.

**Target files:**

- Implementation: `src/lib/utilities.ts`
- Tests: `src/tests/utilities.test.ts`
- Spec: `src/specs/utilities.spec.md`

---

## Startup

1. **Dependencies**
   - From repo root: `rm -rf node_modules && npm install`

2. **Environment**
   - None required for utilities.

3. **Verify**
   - Run tests: `npm test`
   - Run dev CLI: `./bin/dev`

---

## Requirements / behavior

### Scope

#### Export Utilities

- **Find `MsgResource` files in a directory.** Find all the javascript and typescript files in a directory that have an `.msg.` substring in their filename just before the file extension. (For example: `example.msg.ts`) Return an array of file paths.
- **Import `MsgResource` objects from files.**. Given an array of msg file paths, verify that the files have `.msg.` in their filenames and then dynamically import the `MsgResource` objects exported from them. Group the resources by project, and store them in a Map that has `MsgProject` objects as keys and arrays of `MsgResource` resources that inject that project as values. Return the Map.
- **Serialize `MsgResource` collections to xliff 1.2.** Given an array of `MsgResource` objects, serializ the array into a monolingual xliff 1.2 string. Preserve all notes and set the relevant xliff attributes using the attributes objects of each resource or message. Return a new Map that has `MsgProject` instances as keys and the xliff strings as values.
- **Write an xliff 1.2 string to a file.** Given the serialized xliff 1.2 string and a file path, write the xliff string to the specified file path, with appropriate indentation. Return void. Files should be written asynchronously.

#### Import Utilities

- **Read an xliff 1.2 string from a file** Given a valid xliff 1.2 file read the contents of the file into an xliff string. Return the xliff string.
- **Parse and xliff 1.2 string.** Given a valid xliff 1.2 string, parse it into a javascript object, preserving notes and attributes.
- **Extract `MsgResource` translations from xliff 1.2 strings.** Given a parsed xliff 1.2 javascript object, iterate through each file element in the parsed data, extract the translations from the target language translation units, and create an object that conforms to the type of `MsgResourceData`. The `title` should be taken from the basename of the `orig` attribute on the file element. The target language should be used to populate the `lang` attribute. Each trans unit should be used to populate the `messages` array. The `resname` for each unit that belongs to a particular file should be used as the `MsgMessage` `key` and the translated content should used as the `value`. For example:
   ```javascript
   {
      title: "<file element basename>",
      attributes: {
         lang: "<target language>",
         dir: "<if specified in the xliff>",
      },
      messages: [
         {key: "<resname>", value: "<target language content>"}
      ]
   }
   ```
   Notes should NOT be included. Do not extract any translation units where translate is set to "no" or "false". Return an array of `MsgResourceData` objects.
- **Serialize translations to JSON.** Given an array of `MsgResourceData` objects and a directory path, iterate through the array, serialize the MsgResourceData object to JSON, and write it to a file. Each file should be placed in a directory based on its language and should be named using the `title` property of the object. The objects in the array should be written to files asynchronously.  


### Out of scope

- The utility functions should not link together the whole workflow
- XLIFF 2.0 should not be supported


### API / contract

**Public functions or exports:**

| Name | Signature / shape | Description |
|------|-------------------|-------------|
| findMsgResourceFiles | `async (directory: string) => Promise<string[]>` | Finds all `MsgResource` files |
| importMsgResources | `async (filePaths: string[]) => Promise<Map<MsgProject,MsgResource[]>>` | Imports MsgResources from `.msg.` files |
| resourcesToXliffString | `async (resources: MsgResource[]>) => Promise<Map<MsgProject, string>>` | Serializes MsgResource data to Xliff 1.2 |
| writeXliff | `async (filePath: string, xliff:string) => Promise<void>` | Writes xliff 1.2 string to file |
| readXliff | `async (filePath: string) => Promise<string>` | Reads xliff 1.2 string from file |
| xliffToTranslationData | `async (xliff: string) => Promise<MsgResourceData[]>` | Parses xliff 1.2 string|
| parseXliff | `async (xliff: string) => Promise<object>` | Parses xliff 1.2 string to javascript object |
| xliffDataToResourceTranslationData | `async (parsedXliff: object) => Promise<MsgResourceData[]>` | Extacts translation data to `MsgResourceData` object |
| writeTranslationData | `async (filePath: string, data: MsgResourceData) => Promise<void>` | Writes JSON-serialized `MsgResourceData` to file  |

### Edge cases and errors

- If there are no `.msg.` files in a directory, return an empty array.
- If a `MsgResource` object cannot be imported from an `.msg.` file, throw an error.
- If an xliff from a file cannot be parsed, throw an error
- If there are no trans units in a file in an xliff, return a `MsgResourceData` compatible object with an empty messages array.

---

## Test scenarios

### Happy path

#### Export

1. **Finding `.msg.` files**
   - Given: A directory path  
   - When: There are `.msg.` resource files in the directory
   - Then: It should return an array of paths to the files
2. **Importing resources from `.msg.` files**
   - Given: An array of `.msg.` file paths  
   - When: The files export valid `MsgResource` objects  
   - Then: It should return a Map with MsgProject objects as keys and MsgResource object arrays as values.
3. **Serializing resources to xliff strings**
   - Given: An array of MsgResource resource objects  
   - When: The resource objects are well-formed  
   - Then: It should return a Map with MsgProject objects a valid xliff strings as values.
4. **Writing xliffs**
   - Given: A file path and an xliff string  
   - When: The file path is writable
   - Then: It should write the xliff string to the file path and return void.

#### Import

1. **Reading xliffs**
   - Given: An xliff file path  
   - When: The file path is readable  
   - Then: It should return the contents of the file
2. **Parsing xliffs**
   - Given: An xliff string  
   - When: The xliff string is valid xliff 1.2  
   - Then: It should parse the xliff string and return javascript object
3. **Coverting xliff data to MsgResourceData**
   - Given: A javascript object parsed from an xliff 1.2 string  
   - When: The object has translation data  
   - Then: It should extract the translations to `MsgResourceData` objects
4. **Serializing MsgResourceData objects**
   - Given: Given a file path and a MsgResourceData object  
   - When: If the file path is writable  
   - Then: It should serialize the object to JSON return it, returning void.


### Edge cases

1. **_[Scenario]_**
   - Given: An parsed xliff 1.2 javascript object
   - When: There are no translations for a file element  
   - Then: Return a `MsgResourceData` object with an empty messages array

### Error handling

1. **_[Scenario]_**
   - Given: An invalid xliff 1.2 string  
   - When: It cannot be parsed or does not validate  
   - Then: Throw an input error

---

### Process
1. Stub out all utility functions but do not implement. Pause for review.
2. Create a suite of test for each utility function in the same file. Confirm that the tests fail. Create fixtures in the `src/tests/fixtures` folder as needed. Pause for review.
3. Implement each utility function, iterating until all its tests pass. Pause for review.
4. Refactor each utility function for minimum complexity and maximum performance. Pause for review.
5. Continue refactoring until there is 100% test coverage for all functions. Pause for review.
6. Summarize the work done. Pause for review.

### Coding standards
- All functions should have documentation blocks.
- All edge cases should be handled appropriately.
- All errors should be handled appropriately.

## Teardown

1. **Stop running processes** — Ctrl+C any dev server or watchers.
2. **Clean artifacts** — `rm -rf dist coverage` if generated.

---

## Work Summary

**Completed:** 2025-01-30

### Implemented Functions

All 9 utility functions from the API contract are implemented in `src/lib/utilities.ts`:

| Function | Description |
|----------|-------------|
| `findMsgResourceFiles` | Scans directory for `*.msg.ts` and `*.msg.js` files |
| `importMsgResources` | Dynamic imports from .msg. files, groups by MsgProject |
| `resourcesToXliffString` | Serializes MsgResources to monolingual XLIFF 1.2 per project |
| `writeXliff` | Writes XLIFF string to file (async) |
| `readXliff` | Reads XLIFF file contents |
| `parseXliff` | Parses XLIFF 1.2 to object via fast-xml-parser |
| `xliffDataToResourceTranslationData` | Extracts MsgResourceData from parsed XLIFF |
| `xliffToTranslationData` | Parse + extract pipeline |
| `writeTranslationData` | Serializes MsgResourceData to JSON file |

### Dependencies Added

- `fast-xml-parser` — XLIFF 1.2 XML parsing
- `@vitest/coverage-v8` — Test coverage reporting

### Test Coverage

- **15 tests** covering happy paths, edge cases, and error handling
- **97.97%** statement coverage, **100%** function coverage on `utilities.ts`
- Fixtures: `msg-files/`, `msg-files-invalid/`, `xliff/`, `output/`, `empty-dir/`

### Edge Cases Handled

- Empty directory → empty array
- Invalid .msg. filename → throws
- Invalid MsgResource export → throws
- Invalid XLIFF string → throws
- No trans-units in file → MsgResourceData with empty messages
- `translate="no"` / `translate="false"` → unit excluded

---

## Notes

- Conventions: Vitest for tests; see `src/tests/` for patterns.
