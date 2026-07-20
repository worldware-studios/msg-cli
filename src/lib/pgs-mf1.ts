/**
 * Maps between ICU MessageFormat 1 plural/selectordinal/select messages and
 * XLIFF 2.2 PGS (`pgs:switch` / `pgs:case`).
 *
 * Export path: MF1 → MF2 data model (via `@messageformat/icu-messageformat-1`)
 * → shared PGS classification used by `pgs-mf2.ts`.
 * Import path: PGS → nested ICU MF1 string.
 */

import { parse } from "@messageformat/parser";
import { mf1ToMessageData } from "@messageformat/icu-messageformat-1";
import { parseMessage } from "messageformat";
import {
  parsePgsSwitch,
  selectMessageDataToPgsExport,
  type ParsedPgsSwitch,
  type PgsSegmentExport,
  type PgsSegmentImport,
  type PgsSelectorKind,
} from "./pgs-mf2.js";

/**
 * If `source` is an MF1 plural/selectordinal/select message that maps to PGS,
 * returns switch/case segments; otherwise null (caller falls back to plain XLIFF).
 */
export function mf1MessageToPgsExport(
  source: string
): { switchAttr: string; segments: PgsSegmentExport[] } | null {
  try {
    const data = mf1ToMessageData(parse(source));
    return selectMessageDataToPgsExport(data);
  } catch {
    return null;
  }
}

function kindToIcuType(kind: PgsSelectorKind): "plural" | "selectordinal" | "select" {
  if (kind === "plural") return "plural";
  if (kind === "ordinal") return "selectordinal";
  return "select";
}

/** Names of plural/ordinal selectors (their `#` octothorpe in ICU). */
function pluralVarNames(parsedSwitch: ParsedPgsSwitch): Set<string> {
  const names = new Set<string>();
  for (const { kind, name } of parsedSwitch) {
    if (kind === "plural" || kind === "ordinal") names.add(name);
  }
  return names;
}

/**
 * Converts an MF2 segment pattern (or plain text) into an ICU MF1 case body.
 * Plural/ordinal selector vars become `#`; other vars become `{name}`.
 */
function segmentBodyToMf1(
  body: string,
  hashVars: Set<string>
): string {
  const trimmed = body.trim();
  if (!trimmed) return "";
  try {
    const msg = parseMessage(trimmed);
    if ((msg as { type?: string }).type !== "message") {
      return escapeIcuLiteral(trimmed);
    }
    return patternPartsToMf1(
      (msg as { pattern: unknown[] }).pattern,
      hashVars
    );
  } catch {
    return escapeIcuLiteral(trimmed);
  }
}

function patternPartsToMf1(
  pattern: unknown[],
  hashVars: Set<string>
): string {
  let out = "";
  for (const part of pattern) {
    if (typeof part === "string") {
      out += escapeIcuLiteral(part);
      continue;
    }
    if (!part || typeof part !== "object") continue;
    const expr = part as {
      type?: string;
      arg?: { type?: string; name?: string };
    };
    if (expr.type === "expression" && expr.arg?.type === "variable" && expr.arg.name) {
      const name = expr.arg.name;
      out += hashVars.has(name) ? "#" : `{${name}}`;
      continue;
    }
    // Unsupported inline: drop rather than corrupt the ICU string.
  }
  return out;
}

/** Escape `{` / `}` in literal ICU text (leave `#` as-is for translators). */
function escapeIcuLiteral(s: string): string {
  return s.replace(/'/g, "''").replace(/([{}])/g, "'$1'");
}

type CaseTree = Map<string, CaseTree | string>;

function insertCase(
  tree: CaseTree,
  tokens: string[],
  body: string,
  depth: number
): boolean {
  if (tokens.length === 0) return false;
  const token = tokens[depth];
  if (token === undefined) return false;

  if (depth === tokens.length - 1) {
    tree.set(token, body);
    return true;
  }

  let child = tree.get(token);
  if (typeof child === "string") return false;
  if (!child) {
    child = new Map();
    tree.set(token, child);
  }
  return insertCase(child, tokens, body, depth + 1);
}

function serializeCaseTree(
  tree: CaseTree,
  parsedSwitch: ParsedPgsSwitch,
  depth: number,
  hashVars: Set<string>
): string | null {
  const item = parsedSwitch[depth];
  if (!item) return null;
  const icuType = kindToIcuType(item.kind);
  const parts: string[] = [];

  for (const [key, child] of tree) {
    let content: string;
    if (typeof child === "string") {
      content = segmentBodyToMf1(child, hashVars);
    } else {
      const nested = serializeCaseTree(
        child,
        parsedSwitch,
        depth + 1,
        hashVars
      );
      if (nested == null) return null;
      content = nested;
    }
    parts.push(`${key} {${content}}`);
  }

  if (parts.length === 0) return null;
  return `{${item.name}, ${icuType}, ${parts.join(" ")}}`;
}

/**
 * Builds an ICU MessageFormat 1 string from PGS `pgs:switch` and segment bodies.
 * Multi-selector switches are nested as ICU select/plural trees.
 */
export function pgsImportToMf1Message(
  switchAttr: string,
  segments: PgsSegmentImport[]
): string | null {
  const parsedSwitch = parsePgsSwitch(switchAttr);
  if (!parsedSwitch || parsedSwitch.length === 0) return null;
  const n = parsedSwitch.length;
  if (segments.length === 0) return null;

  const hashVars = pluralVarNames(parsedSwitch);
  const tree: CaseTree = new Map();

  for (const seg of segments) {
    const tokens = seg.caseAttr.trim().split(/\s+/).filter(Boolean);
    if (tokens.length !== n) return null;
    if (!insertCase(tree, tokens, seg.body, 0)) return null;
  }

  return serializeCaseTree(tree, parsedSwitch, 0, hashVars);
}
