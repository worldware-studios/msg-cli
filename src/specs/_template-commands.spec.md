## 1. Summary

_[One paragraph that describes the command and what it does]_

## 2. Context

### User Segments

- **User Segment** : Description
- **User Segment** : Description

### User Stories

- As a `user segment`, I want `feature`, so that `outcome`.
- As a `user segment`, I want `feature`, so that `outcome`.

## 3. Functionality

### Primary Functions

- It `performs function` in order to achieve `result`
- It `performs function` in order to achieve `result`

### Secondary Functions

- It `performs secondary function` in order to support `primary function`
- It `performs secondary function` in order to support `primary function`

## 4. Behavior

### Requirements

- It `must/should`
- It `must/should`

### Constraints

- It `must not/should not`
- It `must not/should not`

## 5. Design

### Interface


| Command   | Arguments     | Flags           | Notes   |
| --------- | ------------- | --------------- | ------- |
| `command` | `arg1` `arg2` | `flag1` `flag2` | notes |


### Inputs


| Argument   | Type   | Required | Notes   |
| ---------- | ------ | -------- | ------- |
| `argument` | `type` | `Y/n`    | notes |


### Options


| Option   | Type   | Short   | Long   | Notes   |
| -------- | ------ | ------- | ------ | ------- |
| `option` | `type` | `short` | `long` | notes |


### Outputs


| Output   | Type   | Notes   |
| -------- | ------ | ------- |
| `output` | `type` | notes |


### Outcomes


| Outcome   | Type   | Notes   |
| --------- | ------ | ------- |
| `outcome` | `type` | notes |


## 6. Architecture

### Technologies


| Technology   | Development Only | Notes   |
| ------------ | ---------------- | ------- |
| `technology` | `Y/n`            | notes |


### Components


| Component   | Notes   |
| ----------- | ------- |
| `component` | notes |


### Operations


| Operation   | Notes   |
| ----------- | ------- |
| `operation` | notes |


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

- _[Scenario]_
  - Given:
  - When:
  - Then:

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
