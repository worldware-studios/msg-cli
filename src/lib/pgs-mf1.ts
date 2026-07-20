/**
 * Maps between ICU MessageFormat 1 plural/selectordinal/select messages and
 * XLIFF 2.2 PGS (`pgs:switch` / `pgs:case`).
 *
 * Export path: MF1 → MF2 data model (via `@messageformat/icu-messageformat-1`)
 * → shared PGS classification used by `pgs-mf2.ts`.
 * Import path: PGS → ICU MF1 string (format-preserving reconstruction).
 */

import type {
  PgsSegmentExport,
  PgsSegmentImport,
} from "./pgs-mf2.js";

/**
 * If `source` is an MF1 plural/selectordinal/select message that maps to PGS,
 * returns switch/case segments; otherwise null (caller falls back to plain XLIFF).
 *
 * @param source - ICU MessageFormat 1 source string
 */
export function mf1MessageToPgsExport(
  source: string
): { switchAttr: string; segments: PgsSegmentExport[] } | null {
  void source;
  // Scaffold: implemented in Phase 4 (MF1 → mf1ToMessageData → PGS).
  return null;
}

/**
 * Builds an ICU MessageFormat 1 string from PGS `pgs:switch` and segment bodies.
 * Multi-selector switches are nested as ICU select/plural trees.
 *
 * @param switchAttr - Value of `pgs:switch` (e.g. `plural:count`)
 * @param segments - Segments with `pgs:case` and body text
 */
export function pgsImportToMf1Message(
  switchAttr: string,
  segments: PgsSegmentImport[]
): string | null {
  void switchAttr;
  void segments;
  // Scaffold: implemented in Phase 4 (PGS → nested ICU MF1).
  return null;
}
