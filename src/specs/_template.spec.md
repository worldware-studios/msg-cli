# Development instructions template

Use this template when writing specs that will drive code and test generation. Copy it for each new module or feature and fill in the sections below.

---

## Overview

**Module/feature:** _[Name]_

**Purpose:** _[One or two sentences describing what this builds and why.]_

**Target files:**

- Implementation: `src/lib/_[name]_.ts` (or `src/commands/_[name]_.ts`)
- Tests: `src/tests/_[name]_.test.ts`
- Spec: `src/specs/_[name]_.spec.md`

---

## Startup

_Instructions to get the environment ready before developing or running tests._

1. **Dependencies**
   - From repo root: `npm install`
   - _[Any other install steps, e.g. global tools, env vars.]_

2. **Environment**
   - _[Required env vars, e.g. `export FOO=bar` or `.env` keys.]_
   - _[Optional: link to local packages, e.g. `npm link ../msg`.]_

3. **Verify**
   - Run tests: `npm test`
   - Run dev CLI: `npm run dev -- [args]`
   - _[Any other sanity checks.]_

---

## Requirements / behavior

_Describe what the code must do so it can be generated or implemented._

### Scope

- _[Bullet list of in-scope behaviors.]_

### Out of scope

- _[Behaviors explicitly not implemented in this iteration.]_

### API / contract

**Public functions or exports:**

| Name | Signature / shape | Description |
|------|-------------------|-------------|
| _[fn or export]_ | _[e.g. `(x: string) => number`]_ | _[What it does.]_ |

**Inputs / outputs:**

- _[Valid inputs, edge cases, error conditions.]_
- _[Return shape, thrown errors, side effects.]_

### Edge cases and errors

- _[List cases that must be handled: empty input, null, invalid format, etc.]_

---

## Test scenarios

_Scenarios to turn into unit tests. Each can map to one or more test cases._

### Happy path

1. **_[Scenario name]_**
   - Given: _[Preconditions or inputs.]_
   - When: _[Action or call.]_
   - Then: _[Expected result or assertion.]_

### Edge cases

1. **_[Scenario name]_**
   - Given: _[e.g. empty string, missing file.]_
   - When: _[Action.]_
   - Then: _[Expected result or error.]_

### Error handling

1. **_[Scenario name]_**
   - Given: _[Invalid input or failing dependency.]_
   - When: _[Action.]_
   - Then: _[Expected error type/message or behavior.]_

---

## Teardown

_Instructions to clean up after development or test runs._

1. **Stop running processes**
   - _[e.g. Stop dev server with Ctrl+C, kill any background watchers.]_

2. **Clean generated artifacts**
   - _[e.g. Remove `dist/`, `coverage/`, or temp files.]_
   - Commands: _[e.g. `rm -rf dist coverage`.]_

3. **Reset environment**
   - _[e.g. Unset env vars, unlink packages: `npm unlink msg`.]_

4. **Optional**
   - _[e.g. Restore fixtures, reset DB, clear caches.]_

---

## Notes

- _[Links to ADRs, related specs, or external docs.]_
- _[Conventions: naming, file layout, test framework usage.]_
