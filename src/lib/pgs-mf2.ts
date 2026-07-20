/**
 * Maps between Unicode MessageFormat 2 `.match` messages and XLIFF 2.2 PGS
 * (`pgs:switch` / `pgs:case`, urn:oasis:names:tc:xliff:pgs:1.0).
 *
 * Ordinal vs cardinal :number uses the `select` option passed to PluralRules
 * (`select=ordinal` in MF2 syntax → options Map key `select`, literal `ordinal`).
 */

import {
  parseMessage,
  stringifyMessage,
  validate,
  isSelectMessage,
  isCatchallKey,
  isLiteral,
} from "messageformat";

/** PGS selector keywords (XLIFF 2.2 Extended Part 2 §4.9). */
export type PgsSelectorKind = "plural" | "ordinal" | "gender" | "select";

export type ParsedPgsSwitch = Array<{ kind: PgsSelectorKind; name: string }>;

const PGS_SWITCH_ITEM =
  /^(plural|ordinal|gender|select):([a-zA-Z_][a-zA-Z0-9_]*)$/;

/** Known grammatical gender labels (plus other); extended genders pass as literals. */
const GENDER_LABELS = new Set([
  "feminine",
  "masculine",
  "neuter",
  "other",
]);

export function parsePgsSwitch(value: string): ParsedPgsSwitch | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/);
  const out: ParsedPgsSwitch = [];
  for (const p of parts) {
    const m = p.match(PGS_SWITCH_ITEM);
    if (!m) return null;
    out.push({ kind: m[1] as PgsSelectorKind, name: m[2]! });
  }
  return out.length > 0 ? out : null;
}

/** MF2 variant key node from `messageformat` (minimal structural typing). */
export type VariantKey =
  | { type: "*"; value?: never }
  | { type: "literal"; value: string };

/** Parsed MF2 select (`.match`) message shape from `messageformat`. */
type SelectMessage = {
  type: "select";
  declarations: unknown[];
  selectors: Array<{ type: string; name?: string }>;
  variants: Array<{
    keys: VariantKey[];
    value: unknown[];
  }>;
};

function findInputDeclaration(
  msg: SelectMessage,
  varName: string
): { type: "input"; name: string; value: unknown } | null {
  for (const d of msg.declarations) {
    const decl = d as { type?: string; name?: string; value?: unknown };
    if (decl.type === "input" && decl.name === varName) {
      return decl as { type: "input"; name: string; value: unknown };
    }
  }
  return null;
}

function getFunctionName(expr: {
  functionRef?: { name?: string };
}): string | undefined {
  return expr.functionRef?.name;
}

function getOption(
  opts: Map<string, unknown> | Record<string, unknown> | undefined,
  key: string
): unknown {
  if (!opts) return undefined;
  if (opts instanceof Map) return opts.get(key);
  return opts[key];
}

function getSelectOptionOrdinal(expr: {
  functionRef?: {
    name?: string;
    options?: Map<string, unknown> | Record<string, unknown>;
  };
}): boolean {
  const sel = getOption(expr.functionRef?.options, "select");
  if (!sel || typeof sel !== "object" || sel === null) return false;
  if ((sel as { type?: string }).type !== "literal") return false;
  return (sel as { value?: string }).value === "ordinal";
}

function variantKeyAt(
  msg: SelectMessage,
  variantIndex: number,
  keyIndex: number
): VariantKey | undefined {
  const v = msg.variants[variantIndex];
  return v?.keys[keyIndex];
}

function allKeysAtIndexAreGenderLike(
  msg: SelectMessage,
  keyIndex: number
): boolean {
  for (let vi = 0; vi < msg.variants.length; vi++) {
    const k = variantKeyAt(msg, vi, keyIndex);
    if (!k) return false;
    if (isCatchallKey(k)) continue;
    if (isLiteral(k)) {
      if (!GENDER_LABELS.has(k.value)) return false;
      continue;
    }
    return false;
  }
  return true;
}

/**
 * Classifies MF2 selectors into PGS kinds. Returns null if unsupported.
 */
export function classifySelectMessageForPgs(
  msg: SelectMessage
): ParsedPgsSwitch | null {
  const out: ParsedPgsSwitch = [];
  for (let si = 0; si < msg.selectors.length; si++) {
    const sel = msg.selectors[si];
    if (!sel || sel.type !== "variable" || !sel.name) return null;
    const varName = sel.name;
    const decl = findInputDeclaration(msg, varName);
    if (!decl) return null;

    const expr = decl.value as {
      type?: string;
      functionRef?: { name?: string; options?: Map<string, unknown> };
    };
    if (expr.type !== "expression") return null;

    const fname = getFunctionName(expr);
    if (fname === "number") {
      out.push({
        kind: getSelectOptionOrdinal(expr) ? "ordinal" : "plural",
        name: varName,
      });
      continue;
    }
    if (fname === "string") {
      const kind = allKeysAtIndexAreGenderLike(msg, si)
        ? "gender"
        : "select";
      out.push({ kind, name: varName });
      continue;
    }
    return null;
  }
  return out.length === msg.selectors.length ? out : null;
}

/**
 * Maps an MF2 variant key to a single PGS case token (one selector position).
 */
export function mf2KeyToPgsToken(
  key: VariantKey,
  kind: PgsSelectorKind
): string {
  if (isCatchallKey(key)) {
    return "other";
  }
  if (isLiteral(key)) {
    return key.value;
  }
  return "other";
}

/**
 * Maps a PGS case token back to an MF2 variant key for one selector.
 */
export function pgsTokenToMf2Key(
  token: string,
  kind: PgsSelectorKind
): VariantKey {
  if (kind === "plural" || kind === "ordinal") {
    if (token === "other") {
      return { type: "*" };
    }
    return { type: "literal", value: token };
  }
  return { type: "literal", value: token };
}

function stringifyPattern(pattern: unknown[]): string {
  const wrap = {
    type: "message" as const,
    declarations: [],
    pattern: pattern as SelectMessage["variants"][number]["value"],
  };
  // messageformat's Message type is not exported; pattern/declarations match parse output.
  return stringifyMessage(
    wrap as unknown as Parameters<typeof stringifyMessage>[0]
  );
}

export interface PgsSegmentExport {
  caseAttr: string;
  /** MF2 pattern body for this variant (not necessarily wrapped in {{ }}). */
  sourcePattern: string;
}

/**
 * If `msg` is a classifiable MF2 select (`.match`) data model, returns PGS
 * attributes and per-variant segments; otherwise null.
 */
export function selectMessageDataToPgsExport(
  msg: unknown
): { switchAttr: string; segments: PgsSegmentExport[] } | null {
  if (!isSelectMessage(msg as never)) return null;

  const classification = classifySelectMessageForPgs(
    msg as unknown as SelectMessage
  );
  if (!classification) return null;

  const switchAttr = classification
    .map((c) => `${c.kind}:${c.name}`)
    .join(" ");

  const segments: PgsSegmentExport[] = [];
  const sel = msg as unknown as SelectMessage;
  for (let vi = 0; vi < sel.variants.length; vi++) {
    const variant = sel.variants[vi];
    const caseParts: string[] = [];
    for (let ki = 0; ki < classification.length; ki++) {
      const key = variant.keys[ki];
      if (!key) return null;
      caseParts.push(mf2KeyToPgsToken(key, classification[ki]!.kind));
    }
    segments.push({
      caseAttr: caseParts.join(" "),
      sourcePattern: stringifyPattern(variant.value),
    });
  }

  return { switchAttr, segments };
}

/**
 * If `source` is a classifiable `.match` message, returns PGS attributes and
 * per-variant segments; otherwise null (caller falls back to plain XLIFF).
 */
export function selectMessageToPgsExport(
  source: string
): { switchAttr: string; segments: PgsSegmentExport[] } | null {
  let msg: unknown;
  try {
    msg = parseMessage(source);
  } catch {
    return null;
  }
  return selectMessageDataToPgsExport(msg);
}

export interface PgsSegmentImport {
  caseAttr: string;
  /** Text for target locale (or source when building monolingual). */
  body: string;
}

function parsePatternFromSegmentBody(body: string): unknown[] {
  const trimmed = body.trim();
  if (!trimmed) return [];
  try {
    const m = parseMessage(trimmed);
    if ((m as { type?: string }).type !== "message") return [];
    return (m as { pattern: unknown[] }).pattern;
  } catch {
    return [];
  }
}

function ensureFallbackVariant(
  keysCount: number,
  variants: SelectMessage["variants"]
): void {
  const hasAllStars = variants.some(
    (v: SelectMessage["variants"][number]) =>
      v.keys.length === keysCount &&
      v.keys.every((k: VariantKey) => isCatchallKey(k))
  );
  if (hasAllStars) return;

  const fallbackPattern =
    variants.length > 0
      ? variants[variants.length - 1]!.value
      : ([] as unknown[]);
  const starKeys: VariantKey[] = Array.from({ length: keysCount }, () => ({
    type: "*",
  }));
  variants.push({ keys: starKeys, value: fallbackPattern });
}

/**
 * Builds MF2 source string from PGS `pgs:switch` and segment bodies.
 */
export function pgsImportToSelectMessage(
  switchAttr: string,
  segments: PgsSegmentImport[]
): string | null {
  const parsedSwitch = parsePgsSwitch(switchAttr);
  if (!parsedSwitch || parsedSwitch.length === 0) return null;
  const n = parsedSwitch.length;

  const declarations: unknown[] = [];
  for (const { kind, name } of parsedSwitch) {
    const varRef = { type: "variable", name };
    if (kind === "plural") {
      declarations.push({
        type: "input",
        name,
        value: {
          type: "expression",
          arg: varRef,
          functionRef: { type: "function", name: "number" },
        },
      });
    } else if (kind === "ordinal") {
      const opts = new Map([
        ["select", { type: "literal", value: "ordinal" }],
      ]);
      declarations.push({
        type: "input",
        name,
        value: {
          type: "expression",
          arg: varRef,
          functionRef: { type: "function", name: "number", options: opts },
        },
      });
    } else {
      declarations.push({
        type: "input",
        name,
        value: {
          type: "expression",
          arg: varRef,
          functionRef: { type: "function", name: "string" },
        },
      });
    }
  }

  const selectors = parsedSwitch.map(
    ({ name }) => ({ type: "variable", name }) as const
  );

  const variants: SelectMessage["variants"] = [];
  for (const seg of segments) {
    const tokens = seg.caseAttr.trim().split(/\s+/).filter(Boolean);
    if (tokens.length !== n) return null;
    const keys: VariantKey[] = tokens.map((t, i) =>
      pgsTokenToMf2Key(t, parsedSwitch[i]!.kind)
    );
    variants.push({
      keys,
      value: parsePatternFromSegmentBody(seg.body),
    });
  }

  if (variants.length === 0) return null;

  const msg: SelectMessage = {
    type: "select",
    declarations: declarations as SelectMessage["declarations"],
    selectors: selectors as SelectMessage["selectors"],
    variants,
  };

  ensureFallbackVariant(n, msg.variants);

  try {
    validate(
      msg as unknown as Parameters<typeof validate>[0]
    );
  } catch {
    return null;
  }

  return stringifyMessage(
    msg as unknown as Parameters<typeof stringifyMessage>[0]
  );
}

/** Compare two MF2 strings by parsing and re-stringifying both (for tests). */
export function messagesStructurallyEqual(a: string, b: string): boolean {
  try {
    const ma = parseMessage(a) as Parameters<typeof stringifyMessage>[0];
    const mb = parseMessage(b) as Parameters<typeof stringifyMessage>[0];
    return stringifyMessage(ma) === stringifyMessage(mb);
  } catch {
    return false;
  }
}
