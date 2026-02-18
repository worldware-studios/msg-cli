import { MsgResource, type MsgResourceData } from "@worldware/msg";
import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { basename, dirname, extname, join } from "path";
import { pathToFileURL } from "url";
import { XMLParser } from "fast-xml-parser";
import { existsSync } from "fs";
import { dynamicImportFromUrl } from "./create-resource-helpers.js";

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
 * Filters XLIFF file paths by project name.
 * Keeps paths where filename starts with projectName or projectName is a directory in the path.
 * @param filePaths - Array of absolute XLIFF file paths
 * @param projectName - Project name to filter by
 * @returns Filtered array of paths
 */
export function filterXliffPathsByProject(
  filePaths: string[],
  projectName: string
): string[] {
  return filePaths.filter((p) => {
    const filename = basename(p);
    if (filename.startsWith(projectName)) return true;
    const pathParts = p.split(/[/\\]/);
    return pathParts.some((part) => part === projectName);
  });
}

/**
 * Filters XLIFF file paths by locale.
 * Keeps paths that have .[locale]. in the filename or locale as a directory in the path.
 * @param filePaths - Array of absolute XLIFF file paths
 * @param locale - Locale code to filter by
 * @returns Filtered array of paths
 */
export function filterXliffPathsByLocale(
  filePaths: string[],
  locale: string
): string[] {
  return filePaths.filter((p) => {
    const filename = basename(p);
    if (filename.includes(`.${locale}.`)) return true;
    const pathParts = p.split(/[/\\]/);
    return pathParts.some((part) => part === locale);
  });
}

/** Common locale-like path segments (BCP 47 patterns). */
const LOCALE_PATTERN = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]+)*$/;

/**
 * Extracts project name and locale from an XLIFF file path.
 * Filename patterns: project.locale.xliff, project.xliff. Path segments may also indicate project/locale.
 * @param filePath - Absolute path to XLIFF file
 * @returns Object with project and locale (locale may be undefined for monolingual)
 */
export function parseXliffFilename(filePath: string): {
  project: string;
  locale?: string;
} {
  const filename = basename(filePath);
  const match = filename.match(XLIFF_FILENAME_PATTERN);
  const pathParts = filePath.split(/[/\\]/);

  let project: string;
  let locale: string | undefined;

  if (match) {
    const [, proj, loc] = match;
    project = proj ?? basename(filename, extname(filename));
    locale = loc;
  } else {
    project = basename(filename, extname(filename));
  }

  // If locale not in filename, check path segments (e.g. .../project/zh/file.xliff)
  if (!locale) {
    for (const part of pathParts) {
      if (LOCALE_PATTERN.test(part) && part.length >= 2) {
        locale = part;
        break;
      }
    }
  }
  if (!project && pathParts.length >= 2) {
    for (const part of pathParts) {
      if (part && !XLIFF_EXTENSIONS.some((e) => part.endsWith(e))) {
        project = part;
        break;
      }
    }
  }

  return { project, locale };
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
});

/**
 * Parses XLIFF 2.0 XML string to a JavaScript object.
 * @param xml - XLIFF 2.0 XML string
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
    throw new Error(`Malformed XLIFF 2.0: ${message}`);
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

/** Extracts text from segment source/target, handling inline elements per XLIFF 2.0. */
function extractSegmentText(segment: unknown): string {
  if (segment == null) return "";
  const seg = segment as Record<string, unknown>;
  const target = seg.target ?? seg.source;
  if (typeof target === "string") return target;
  if (target && typeof target === "object") {
    return extractInlineText(target as Record<string, unknown>);
  }
  return "";
}

/** Recursively extracts text from XLIFF inline content (pc, mrk, ph, etc.). */
function extractInlineText(node: Record<string, unknown>): string {
  let text = "";
  if ("#text" in node && typeof node["#text"] === "string") {
    text += node["#text"];
  }
  const children = ["pc", "sc", "ec", "ph", "mrk", "sm", "em", "cp", "target", "source"];
  for (const tag of children) {
    const child = node[tag];
    if (Array.isArray(child)) {
      for (const c of child) {
        const childObj = typeof c === "object" && c !== null ? c : {};
        text += extractInlineText(childObj as Record<string, unknown>);
      }
    } else if (child && typeof child === "object") {
      text += extractInlineText(child as Record<string, unknown>);
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

/** Processes a flat array of unit elements. */
function processUnitsFromItems(
  units: unknown[],
  fileAttrs: FileLevelAttrs
): Array<{ key: string; value: string; attributes: { lang?: string; dir?: string; dnt?: boolean }; notes: Array<{ type: string; content: string }> }> {
  const messages: Array<{
    key: string;
    value: string;
    attributes: { lang?: string; dir?: string; dnt?: boolean };
    notes: Array<{ type: string; content: string }>;
  }> = [];
  for (const u of units) {
    const msg = processUnit(u as Record<string, unknown>, fileAttrs);
    if (msg) messages.push(msg);
  }
  return messages;
}

/** Recursively extracts messages from group elements (which contain unit and/or group). */
function processGroupsForMessages(
  groups: unknown[],
  fileAttrs: FileLevelAttrs
): Array<{ key: string; value: string; attributes: { lang?: string; dir?: string; dnt?: boolean }; notes: Array<{ type: string; content: string }> }> {
  const messages: Array<{
    key: string;
    value: string;
    attributes: { lang?: string; dir?: string; dnt?: boolean };
    notes: Array<{ type: string; content: string }>;
  }> = [];
  for (const item of groups) {
    const obj = item as Record<string, unknown>;
    if (obj.unit) {
      const units = Array.isArray(obj.unit) ? obj.unit : [obj.unit];
      messages.push(...processUnitsFromItems(units, fileAttrs));
    }
    if (obj.group) {
      const nestedGroups = Array.isArray(obj.group) ? obj.group : [obj.group];
      messages.push(...processGroupsForMessages(nestedGroups, fileAttrs));
    }
  }
  return messages;
}

function processUnit(
  unit: Record<string, unknown>,
  fileAttrs: FileLevelAttrs
): { key: string; value: string; attributes: { lang?: string; dir?: string; dnt?: boolean }; notes: Array<{ type: string; content: string }> } | null {
  const name = (unit["@_name"] ?? unit["@_id"] ?? "") as string;
  const trgLang = (unit["@_trgLang"] ?? fileAttrs.trgLang) as string;
  const trgDir = (unit["@_trgDir"] ?? fileAttrs.trgDir) as string | undefined;
  const translate = ((unit["@_translate"] ?? "yes") as string).toLowerCase();
  const dnt = translate === "no" || translate === "false";

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
  const targetParts: string[] = [];
  for (const seg of segments) {
    targetParts.push(extractSegmentText(seg));
  }
  const value = targetParts.join("");

  const attributes: { lang?: string; dir?: string; dnt?: boolean } = {};
  if (trgLang !== fileAttrs.trgLang) attributes.lang = trgLang || undefined;
  if (trgDir !== fileAttrs.trgDir) attributes.dir = trgDir || undefined;
  if (dnt !== fileDnt) attributes.dnt = dnt;

  return {
    key: name,
    value,
    attributes,
    notes,
  };
}

/**
 * Extracts MsgResource from parsed XLIFF 2.0 object for a single file element.
 * @param fileEl - Parsed file element
 * @param xliffTrgLang - trgLang from xliff root (may be undefined for monolingual)
 * @param project - MsgProject instance
 * @param targetLocales - Array of supported target locale keys
 * @returns MsgResource or null if file should be skipped (monolingual or unsupported locale)
 */
export function extractResourceFromXliffFile(
  fileEl: Record<string, unknown>,
  xliffTrgLang: string | undefined,
  project: { locales: { targetLocales: Record<string, string[]> } },
  targetLocales: string[]
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
    dir: trgDir ?? "",
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

  const allMessages = [
    ...processUnitsFromItems(
      fileEl.unit ? (Array.isArray(fileEl.unit) ? fileEl.unit : [fileEl.unit]) : [],
      fileAttrs
    ),
    ...processGroupsForMessages(
      fileEl.group ? (Array.isArray(fileEl.group) ? fileEl.group : [fileEl.group]) : [],
      fileAttrs
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
 * @param locale - Target locale (from filename)
 * @returns ImportResult or null if file should be skipped
 */
export async function processXliffFile(
  xliffPath: string,
  projectsDir: string,
  projectName: string,
  locale: string
): Promise<ImportResult | null> {
  let project;
  try {
    project = await importMsgProject(projectsDir, projectName);
  } catch {
    return null; // Project not found, skip
  }

  const targetLocales = Object.keys(project.locales.targetLocales);
  if (!targetLocales.includes(locale)) return null;

  const xml = await readFile(xliffPath, "utf-8");
  const parsed = parseXliff20(xml);
  const xliffRoot = (parsed as Record<string, unknown>).xliff as Record<string, unknown> | undefined;
  if (!xliffRoot) return null;

  const xliffTrgLang = xliffRoot["@_trgLang"] as string | undefined;
  if (!xliffTrgLang) return null; // Monolingual

  const fileEls = xliffRoot.file;
  const files = Array.isArray(fileEls) ? fileEls : fileEls ? [fileEls] : [];

  const resources: Array<{ title: string; json: string }> = [];
  for (const fileEl of files) {
    const resource = extractResourceFromXliffFile(
      fileEl as Record<string, unknown>,
      xliffTrgLang,
      project,
      targetLocales
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