# Development instructions: utilities

_Spec for code and test generation. Template: `_template.spec.md`._

---

## Overview

**Module/feature:** utilities

**Purpose:** Shared helpers used by CLI commands (paths, validation, formatting).

**Target files:**

- Implementation: `src/lib/utilities.ts`
- Tests: `src/tests/utilities.test.ts`
- Spec: `src/specs/utilities.spec.md`

---

## Startup

1. **Dependencies**
   - From repo root: `npm install`
   - Optional: `npm link ../msg` if using local msg package.

2. **Environment**
   - None required for utilities.

3. **Verify**
   - Run tests: `npm test`
   - Run dev CLI: `npm run dev -- --help`

---

## Requirements / behavior

### Scope

- _[Add in-scope behaviors, e.g. path normalization, locale validation.]_

### Out of scope

- _[Behaviors not in this module.]_

### API / contract

**Public functions or exports:**

| Name | Signature / shape | Description |
|------|-------------------|-------------|
| _[fn]_ | _[signature]_ | _[description]_ |

### Edge cases and errors

- _[List cases to handle.]_

---

## Test scenarios

### Happy path

1. **_[Scenario]_**
   - Given: _[inputs]_  
   - When: _[action]_  
   - Then: _[expected]_

### Edge cases

1. **_[Scenario]_**
   - Given: _[edge input]_  
   - When: _[action]_  
   - Then: _[expected]_

### Error handling

1. **_[Scenario]_**
   - Given: _[invalid input]_  
   - When: _[action]_  
   - Then: _[expected error]_

---

## Teardown

1. **Stop running processes** — Ctrl+C any dev server or watchers.
2. **Clean artifacts** — `rm -rf dist coverage` if generated.
3. **Reset environment** — `npm unlink msg` if you linked the msg package.

---

## Notes

- Conventions: Vitest for tests; see `src/tests/` for patterns.
