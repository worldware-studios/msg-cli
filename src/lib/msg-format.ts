/**
 * Maps `@worldware/msg` `format` values to XLIFF 2.2 `unit@type` and back.
 *
 * XLIFF requires custom `type` values on `<unit>` to use `prefix:value` form
 * (see XLIFF 2.2 Core §3.3.1.40). We use the `msg:` authority prefix.
 */

import { MSG_DEFAULT_FORMAT } from "@worldware/msg";

/** Message format values supported by `@worldware/msg`. */
export type MsgFormat = "NONE" | "MF1" | "MF2";

const MSG_TYPE_PREFIX = "msg";

const FORMAT_VALUES = new Set<MsgFormat>(["NONE", "MF1", "MF2"]);

/**
 * Encodes a format as an XLIFF 2.2 unit `type` attribute value.
 * @example formatToUnitType("MF1") → "msg:MF1"
 */
export function formatToUnitType(format: MsgFormat): string {
  return `${MSG_TYPE_PREFIX}:${format}`;
}

/**
 * Decodes an XLIFF unit `type` into a MsgFormat.
 * Accepts `msg:MF1` (canonical) and bare `MF1` for resilience.
 * @returns undefined when type is missing or not a recognized format
 */
export function unitTypeToFormat(
  type: string | undefined | null
): MsgFormat | undefined {
  if (type == null || type === "") return undefined;
  if (FORMAT_VALUES.has(type as MsgFormat)) {
    return type as MsgFormat;
  }
  const prefixed = new RegExp(
    `^${MSG_TYPE_PREFIX}:(NONE|MF1|MF2)$`
  ).exec(type);
  if (prefixed?.[1] && FORMAT_VALUES.has(prefixed[1] as MsgFormat)) {
    return prefixed[1] as MsgFormat;
  }
  return undefined;
}

/**
 * Resolves the effective format for a message using inheritance
 * (message → resource → project → library default).
 */
export function resolveMessageFormat(
  messageFormat?: MsgFormat,
  resourceFormat?: MsgFormat,
  projectFormat?: MsgFormat
): MsgFormat {
  return (
    messageFormat ??
    resourceFormat ??
    projectFormat ??
    (MSG_DEFAULT_FORMAT as MsgFormat)
  );
}
