import { MsgResource, type MsgResourceData } from "@worldware/msg";
import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, sep } from "path";
import { pathToFileURL } from "url";
import { XMLParser } from "fast-xml-parser";
import { existsSync } from "fs";
import { dynamicImportFromUrl } from "./create-resource-helpers.js";
import { unitTypeToFormat, type MsgFormat } from "./msg-format.js";
import { pgsImportToMf1Message } from "./pgs-mf1.js";
import { pgsImportToSelectMessage } from "./pgs-mf2.js";

/** File extensions considered XLIFF files. */
const XLIFF_EXTENSIONS = [".xliff", ".xlf"];

/** Pattern to match XLIFF filenames like project.locale.xliff or project.xliff */
const XLIFF_FILENAME_PATTERN = /^(.+?)(?:\.([a-zA-Z]{2,}(?:-[a-zA-Z0-9]+)*))?\.(?:xliff|xlf)$/i;

/**
 * Recursively finds all XLIFF files in a directory.
 * @param directory - Absolute path to the xliff directory (e.g. l10n/xliff)
 * @returns Promise resolving to array of absolute file paths
 */
export async function findXliffFilePaths(directory: string): Promise<string[]> {
  const result: string[] = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (XLIFF_EXTENSIONS.includes(ext)) {
        result.push(fullPath);
      }
    } else if (entry.isDirectory()) {
      result.push(...(await findXliffFilePaths(fullPath)));
    }
  }
  return result;
}

/**
 * Returns the directory names between the xliff root and an XLIFF file.
 *
 * Path-based project/locale detection must only look below the xliff root:
 * directories above it (`/var`, `/tmp`, `src`, ...) belong to the machine,
 * not to the msg layout, and many of them look like locale codes.
 * @param xliffDir - Absolute path to the xliff directory (e.g. l10n/xliff)
 * @param filePath - Absolute path to an XLIFF file
 * @returns Directory segments under xliffDir, excluding the file name; empty
 *   when the file is directly in xliffDir or outside it
 */
export function xliffDirSegments(xliffDir: string, filePath: string): string[] {
  const rel = relative(xliffDir, filePath);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    return [];
  }
  // Drop the file name; only directories carry project/locale hints.
  return rel.split(/[/\\]/).slice(0, -1);
}

/**
 * Filters XLIFF file paths by project name.
 * Keeps paths where filename starts with projectName or projectName is a directory under xliffDir.
 * @param filePaths - Array of absolute XLIFF file paths
 * @param projectName - Project name to filter by
 * @param xliffDir - Absolute path to the xliff directory the paths were found in
 * @returns Filtered array of paths
 */
export function filterXliffPathsByProject(
  filePaths: string[],
  projectName: string,
  xliffDir: string
): string[] {
  return filePaths.filter((p) => {
    const filename = basename(p);
    if (filename.startsWith(projectName)) return true;
    return xliffDirSegments(xliffDir, p).some((part) => part === projectName);
  });
}

/**
 * Filters XLIFF file paths by locale.
 * Keeps paths that have .[locale]. in the filename or locale as a directory under xliffDir.
 * @param filePaths - Array of absolute XLIFF file paths
 * @param locale - Locale code to filter by
 * @param xliffDir - Absolute path to the xliff directory the paths were found in
 * @returns Filtered array of paths
 */
export function filterXliffPathsByLocale(
  filePaths: string[],
  locale: string,
  xliffDir: string
): string[] {
  return filePaths.filter((p) => {
    const filename = basename(p);
    if (filename.includes(`.${locale}.`)) return true;
    return xliffDirSegments(xliffDir, p).some((part) => part === locale);
  });
}

/** Common locale-like path segments (BCP 47 patterns). */
const LOCALE_PATTERN = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]+)*$/;

/**
 * Extracts project name and locale from an XLIFF file path.
 * Filename patterns: project.locale.xliff, project.xliff. Directories under
 * xliffDir may also indicate project/locale (e.g. xliff/zh/project.xliff).
 * @param filePath - Absolute path to XLIFF file
 * @param xliffDir - Absolute path to the xliff directory the file was found in
 * @returns Object with project and locale (locale may be undefined for monolingual);
 *   `filenameLocale` is the locale from the file name alone (`project.locale.xliff`)
 */
export function parseXliffFilename(filePath: string, xliffDir: string): {
  project: string;
  locale?: string;
  filenameLocale?: string;
} {
  const filename = basename(filePath);
  const match = filename.match(XLIFF_FILENAME_PATTERN);
  // Without a pattern match (e.g. a bare ".xliff"), fall back to the file
  // name itself; basename never yields "" here, so project is always set.
  const project = match?.[1] ?? basename(filename, extname(filename));
  // If locale not in filename, check directories under the xliff root (e.g. xliff/project/zh/file.xliff)
  const locale =
    match?.[2] ??
    xliffDirSegments(xliffDir, filePath).find((part) => LOCALE_PATTERN.test(part));

  return { project, locale, filenameLocale: match?.[2] };
}

/** Duck-type check for MsgProject. */
function isMsgProjectLike(value: unknown): value is { locales: { targetLocales: Record<string, string[]> } } {
  if (!value || typeof value !== "object") return false;
  const loc = (value as { locales?: { targetLocales?: unknown } }).locales?.targetLocales;
  return typeof loc === "object" && loc !== null && !Array.isArray(loc);
}

/**
 * Dynamically imports MsgProject from i18n/projects by project name.
 * @param projectsDir - Absolute path to i18n/projects
 * @param projectName - Project name (filename without extension)
 * @returns Promise resolving to MsgProject-like object with targetLocales
 * @throws Error if project cannot be loaded
 */
export async function importMsgProject(
  projectsDir: string,
  projectName: string
): Promise<{ locales: { targetLocales: Record<string, string[]> } }> {
  const basePath = join(projectsDir, projectName);
  const exts = [".ts", ".js"];
  for (const ext of exts) {
    const p = `${basePath}${ext}`;
    if (existsSync(p)) {
      const url = pathToFileURL(p).href;
      const mod = await dynamicImportFromUrl(url);
      const project = mod?.default ?? mod;
      if (!isMsgProjectLike(project)) {
        throw new Error(`Project file '${projectName}${ext}' does not export a valid MsgProject.`);
      }
      return project;
    }
  }
  throw new Error(`Project file not found: ${projectName}`);
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Keep segment content as raw XML: the default (non-order-preserving) mode
  // groups mixed content by tag, scrambling text around inline elements.
  // extractSegmentText re-parses it in document order.
  stopNodes: ["*.source", "*.target"],
});

/** Parses segment content in document order, without trimming or type coercion. */
const inlineContentParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: true,
  trimValues: false,
  parseTagValue: false,
  // Decode numeric character references (&#13;, &#xA0;), which fast-xml-parser leaves
  // as literal text by default. Export writes CR as &#13; so it survives parsing.
  htmlEntities: true,
});

/** A node from a `preserveOrder` parse: one tag key (or `#text`) plus optional `:@` attributes. */
type OrderedNode = Record<string, unknown> & { ":@"?: Record<string, string> };

/**
 * Parses XLIFF 2.x XML string to a JavaScript object (2.0 and 2.2 supported).
 * @param xml - XLIFF XML string
 * @returns Parsed object
 * @throws Error if XML is malformed
 */
export function parseXliff20(xml: string): object {
  try {
    const parsed = xmlParser.parse(xml);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Failed to parse XLIFF");
    }
    return parsed;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to parse XLIFF";
    throw new Error(`Malformed XLIFF: ${message}`);
  }
}

/** Note type from XLIFF category (uppercased for MsgNote.type). */
function categoryToNoteType(category: string): string {
  const lower = category.toLowerCase();
  if (lower.startsWith("x-")) return category.toUpperCase();
  const map: Record<string, string> = {
    description: "DESCRIPTION",
    authorship: "AUTHORSHIP",
    parameters: "PARAMETERS",
    context: "CONTEXT",
    comment: "COMMENT",
  };
  return map[lower] ?? category.toUpperCase();
}

/** XLIFF `xml:space` value: `preserve` keeps all whitespace; `default` lets the importer trim. */
export type XmlSpace = "default" | "preserve";

/**
 * Returns the element's own `xml:space` when it is valid, otherwise the inherited value
 * (XLIFF 2 §4.3.2.2: `xml:space` is inherited from the parent element).
 */
function resolveXmlSpace(el: unknown, inherited: XmlSpace): XmlSpace {
  const own =
    el && typeof el === "object" ? (el as Record<string, unknown>)["@_xml:space"] : undefined;
  return own === "preserve" || own === "default" ? own : inherited;
}

/** Trims XML whitespace (space, tab, CR, LF) only; `String.prototype.trim` would also drop NBSP etc. */
function trimXmlWhitespace(text: string): string {
  return text.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");
}

/** Extracts text from segment source/target, handling inline elements per XLIFF 2.0.
 * Returns the already-decoded in-memory string; JSON encoding is left to `toJSON()`.
 * @param space - `xml:space` inherited from the enclosing unit; `<source>`/`<target>` may override it.
 */
function extractSegmentText(segment: unknown, space: XmlSpace): string {
  if (segment == null) return "";
  const seg = segment as Record<string, unknown>;
  const content = seg.target ?? seg.source;
  // A stop node with attributes (e.g. <target xml:lang="..">) parses as { "#text": raw, "@_...": ... }.
  const raw =
    content && typeof content === "object"
      ? (content as Record<string, unknown>)["#text"]
      : content;
  if (typeof raw !== "string" || raw === "") return "";
  const [root] = inlineContentParser.parse(`<c>${raw}</c>`) as OrderedNode[];
  const text = extractInlineText(root!.c as OrderedNode[]);
  // Under `default`, trim the ends as plain-text targets always were (XLIFF 2 §4.7.5 allows it).
  return resolveXmlSpace(content, space) === "preserve" ? text : trimXmlWhitespace(text);
}

/** Decodes a `<cp hex="..">` value, substituting U+FFFD when it is not a valid code point. */
function codePointFromHex(hex: string | undefined): string {
  const cp = /^[0-9a-f]{1,6}$/i.test(hex ?? "") ? parseInt(hex!, 16) : NaN;
  return cp <= 0x10ffff ? String.fromCodePoint(cp) : "\uFFFD";
}

/** Rebuilds text from XLIFF inline content (pc, mrk, ph, ...) in document order. */
function extractInlineText(nodes: OrderedNode[]): string {
  let text = "";
  for (const node of nodes) {
    if ("#text" in node) {
      text += String(node["#text"]);
      continue;
    }
    const tag = Object.keys(node).find((k) => k !== ":@");
    const attrs = node[":@"] ?? {};
    switch (tag) {
      case "ph":
      case "sc":
      case "ec":
        // Placeholder codes have no content; use their plain-text equivalent.
        text += attrs["@_equiv"] ?? attrs["@_disp"] ?? "";
        break;
      case "cp":
        text += codePointFromHex(attrs["@_hex"]);
        break;
      case "sm":
      case "em":
        break;
      default:
        // pc, mrk, and anything unrecognized contribute their content.
        if (tag) text += extractInlineText(node[tag] as OrderedNode[]);
    }
  }
  return text;
}

/** File-level attributes used to omit redundant unit attributes. */
interface FileLevelAttrs {
  trgLang: string;
  trgDir?: string;
  translate: string;
}

type ImportedMessage = {
  key: string;
  value: string;
  attributes: { lang?: string; dir?: string; dnt?: boolean; format?: MsgFormat };
  notes: Array<{ type: string; content: string }>;
};

/** Processes a flat array of unit elements. */
function processUnitsFromItems(
  units: unknown[],
  fileAttrs: FileLevelAttrs,
  space: XmlSpace
): ImportedMessage[] {
  const messages: ImportedMessage[] = [];
  for (const u of units) {
    const msg = processUnit(u as Record<string, unknown>, fileAttrs, space);
    if (msg) messages.push(msg);
  }
  return messages;
}

/** Recursively extracts messages from group elements (which contain unit and/or group). */
function processGroupsForMessages(
  groups: unknown[],
  fileAttrs: FileLevelAttrs,
  space: XmlSpace
): ImportedMessage[] {
  const messages: ImportedMessage[] = [];
  for (const item of groups) {
    const obj = item as Record<string, unknown>;
    const groupSpace = resolveXmlSpace(obj, space);
    if (obj.unit) {
      const units = Array.isArray(obj.unit) ? obj.unit : [obj.unit];
      messages.push(...processUnitsFromItems(units, fileAttrs, groupSpace));
    }
    if (obj.group) {
      const nestedGroups = Array.isArray(obj.group) ? obj.group : [obj.group];
      messages.push(...processGroupsForMessages(nestedGroups, fileAttrs, groupSpace));
    }
  }
  return messages;
}

function processUnit(
  unit: Record<string, unknown>,
  fileAttrs: FileLevelAttrs,
  inheritedSpace: XmlSpace
): ImportedMessage | null {
  const space = resolveXmlSpace(unit, inheritedSpace);
  const name = (unit["@_name"] ?? unit["@_id"] ?? "") as string;
  const trgLang = (unit["@_trgLang"] ?? fileAttrs.trgLang) as string;
  const trgDir = (unit["@_trgDir"] ?? fileAttrs.trgDir) as string | undefined;
  const translate = ((unit["@_translate"] ?? "yes") as string).toLowerCase();
  const dnt = translate === "no" || translate === "false";
  const format = unitTypeToFormat(unit["@_type"] as string | undefined);

  const fileTranslate = (fileAttrs.translate ?? "yes").toLowerCase();
  const fileDnt = fileTranslate === "no" || fileTranslate === "false";

  const notes: Array<{ type: string; content: string }> = [];
  const notesEl = unit.notes as { note?: unknown } | undefined;
  if (notesEl?.note) {
    const noteArr = Array.isArray(notesEl.note) ? notesEl.note : [notesEl.note];
    for (const n of noteArr) {
      const note = n as Record<string, unknown>;
      const category = (note["@_category"] ?? "comment") as string;
      const content = (note["#text"] ?? "") as string;
      notes.push({ type: categoryToNoteType(category), content });
    }
  }

  const segments = unit.segment
    ? Array.isArray(unit.segment)
      ? unit.segment
      : [unit.segment]
    : [];

  const pgsSwitch = unit["@_pgs:switch"] as string | undefined;

  const joinSegmentTexts = (): string =>
    segments.map((seg) => extractSegmentText(seg, space)).join("");

  let value: string;
  if (
    pgsSwitch &&
    segments.length > 0 &&
    segments.every(
      (seg) =>
        typeof (seg as Record<string, unknown>)["@_pgs:case"] === "string"
    )
  ) {
    const importSegments = segments.map((seg) => ({
      caseAttr: (seg as Record<string, unknown>)["@_pgs:case"] as string,
      body: extractSegmentText(seg, space),
    }));
    const rebuilt =
      format === "MF1"
        ? pgsImportToMf1Message(pgsSwitch, importSegments)
        : pgsImportToSelectMessage(pgsSwitch, importSegments);
    value = rebuilt ?? joinSegmentTexts();
  } else {
    value = joinSegmentTexts();
  }

  const attributes: {
    lang?: string;
    dir?: string;
    dnt?: boolean;
    format?: MsgFormat;
  } = {};
  if (trgLang !== fileAttrs.trgLang) attributes.lang = trgLang || undefined;
  if (trgDir !== fileAttrs.trgDir) attributes.dir = trgDir || undefined;
  if (dnt !== fileDnt) attributes.dnt = dnt;
  if (format) attributes.format = format;

  return {
    key: name,
    value,
    attributes,
    notes,
  };
}

/**
 * Extracts MsgResource from parsed XLIFF 2.x object for a single file element.
 * @param fileEl - Parsed file element
 * @param xliffTrgLang - trgLang from xliff root (may be undefined for monolingual)
 * @param project - MsgProject instance
 * @param targetLocales - Array of supported target locale keys
 * @param xliffSpace - `xml:space` from the xliff root, inherited by the file (default `default`)
 * @returns MsgResource or null if file should be skipped (monolingual or unsupported locale)
 */
export function extractResourceFromXliffFile(
  fileEl: Record<string, unknown>,
  xliffTrgLang: string | undefined,
  project: { locales: { targetLocales: Record<string, string[]> } },
  targetLocales: string[],
  xliffSpace: XmlSpace = "default"
): MsgResource | null {
  const trgLang = (fileEl["@_trgLang"] ?? xliffTrgLang) as string | undefined;
  if (!trgLang) return null; // Monolingual, skip
  if (!targetLocales.includes(trgLang)) return null; // Unsupported locale, skip

  const original = (fileEl["@_original"] ?? "unknown.json") as string;
  const title = basename(original, extname(original)) || original;
  const trgDir = fileEl["@_trgDir"] as string | undefined;
  const translate = ((fileEl["@_translate"] ?? "yes") as string).toLowerCase();
  const dnt = translate === "no" || translate === "false";

  const attributes = {
    lang: trgLang,
    dir: trgDir ?? "auto",
    dnt,
  };

  const notes: Array<{ type: string; content: string }> = [];
  const notesEl = fileEl.notes as { note?: unknown } | undefined;
  if (notesEl?.note) {
    const noteArr = Array.isArray(notesEl.note) ? notesEl.note : [notesEl.note];
    for (const n of noteArr) {
      const note = n as Record<string, unknown>;
      const category = (note["@_category"] ?? "comment") as string;
      const content = (note["#text"] ?? "") as string;
      notes.push({ type: categoryToNoteType(category), content });
    }
  }

  const fileAttrs: FileLevelAttrs = {
    trgLang,
    trgDir,
    translate,
  };

  const fileSpace = resolveXmlSpace(fileEl, xliffSpace);
  const allMessages = [
    ...processUnitsFromItems(
      fileEl.unit ? (Array.isArray(fileEl.unit) ? fileEl.unit : [fileEl.unit]) : [],
      fileAttrs,
      fileSpace
    ),
    ...processGroupsForMessages(
      fileEl.group ? (Array.isArray(fileEl.group) ? fileEl.group : [fileEl.group]) : [],
      fileAttrs,
      fileSpace
    ),
  ];

  const resourceData = {
    title,
    attributes,
    notes,
    messages: allMessages.map((m) => ({
      key: m.key,
      value: m.value,
      attributes: m.attributes,
      notes: m.notes.length > 0 ? m.notes : undefined,
    })),
  };

  const proj = project as Parameters<typeof MsgResource.create>[1];
  return MsgResource.create(resourceData as MsgResourceData, proj);
}

/** Result of processing one XLIFF file: project, locale, and resources to write. */
export interface ImportResult {
  project: string;
  locale: string;
  resources: Array<{ title: string; json: string }>;
}

/**
 * Processes one XLIFF file: reads, parses, extracts resources, returns JSON strings for writing.
 * @param xliffPath - Absolute path to XLIFF file
 * @param projectsDir - Absolute path to i18n/projects
 * @param projectName - Project name (from filename, for loading MsgProject)
 * @param pathLocale - Locale from the file name, if any; must match the file's `trgLang`
 * @param warn - Receives a message for each skip the user should hear about
 *   (monolingual file, file name locale that disagrees with `trgLang`)
 * @returns ImportResult (locale = the file's `trgLang`) or null if the file should be skipped
 */
export async function processXliffFile(
  xliffPath: string,
  projectsDir: string,
  projectName: string,
  pathLocale: string | undefined,
  warn: (message: string) => void = () => {}
): Promise<ImportResult | null> {
  // Read the file first: trgLang, not the path, decides the locale (and whether
  // the file is monolingual), and the user should hear about it even when no
  // project matches.
  const xml = await readFile(xliffPath, "utf-8");
  const parsed = parseXliff20(xml);
  const xliffRoot = (parsed as Record<string, unknown>).xliff as Record<string, unknown> | undefined;
  if (!xliffRoot) return null;

  const xliffTrgLang = xliffRoot["@_trgLang"] as string | undefined;
  if (!xliffTrgLang) {
    warn(`Skipping monolingual file (no target locale): ${xliffPath}`);
    return null;
  }
  // BCP 47 tags are case-insensitive.
  if (pathLocale && pathLocale.toLowerCase() !== xliffTrgLang.toLowerCase()) {
    warn(`Skipping ${xliffPath}: file name locale '${pathLocale}' does not match trgLang '${xliffTrgLang}'`);
    return null;
  }
  const locale = xliffTrgLang;

  let project;
  try {
    project = await importMsgProject(projectsDir, projectName);
  } catch {
    return null; // Project not found, skip
  }

  const targetLocales = Object.keys(project.locales.targetLocales);
  if (!targetLocales.includes(locale)) return null;

  const fileEls = xliffRoot.file;
  const files = Array.isArray(fileEls) ? fileEls : fileEls ? [fileEls] : [];

  const xliffSpace = resolveXmlSpace(xliffRoot, "default");
  const resources: Array<{ title: string; json: string }> = [];
  for (const fileEl of files) {
    const resource = extractResourceFromXliffFile(
      fileEl as Record<string, unknown>,
      xliffTrgLang,
      project,
      targetLocales,
      xliffSpace
    );
    if (resource) {
      const json = resource.toJSON(true); // strip notes
      resources.push({ title: resource.title, json });
    }
  }

  if (resources.length === 0) return null;
  return { project: projectName, locale, resources };
}

/**
 * Writes translation JSON files to l10n/translations/project/locale/.
 * @param translationsDir - Absolute path to l10n/translations
 * @param result - ImportResult from processXliffFile
 */
export async function writeTranslationFiles(
  translationsDir: string,
  result: ImportResult
): Promise<void> {
  const { project, locale, resources } = result;
  const projectDir = join(translationsDir, project);
  const localeDir = join(projectDir, locale);
  await mkdir(localeDir, { recursive: true });
  for (const { title, json } of resources) {
    const filePath = join(localeDir, `${title}.json`);
    await writeFile(filePath, json, "utf-8");
  }
}