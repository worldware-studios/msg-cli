import {
  MsgProject,
  MsgResource,
  type MsgResourceData,
} from "@worldware/msg";
import { readdir, readFile, writeFile } from "fs/promises";
import { basename, extname, join } from "path";
import { pathToFileURL } from "url";
import { XMLParser } from "fast-xml-parser";

const MSG_PATTERN = /\.msg\.(ts|js)$/i;

/** Duck-type check for MsgResource so imports from the project's @worldware/msg are accepted (avoids instanceof across package copies). */
function isMsgResourceLike(
  value: unknown
): value is MsgResource {
  return (
    Boolean(value) &&
    typeof (value as { getProject?: unknown }).getProject === "function"
  );
}

/**
 * Recursively finds all javascript and typescript files in a directory that have
 * an `.msg.` substring in their filename just before the file extension.
 * @param directory - The directory path to search
 * @returns Promise resolving to array of file paths
 */
export async function findMsgResourceFiles(
  directory: string
): Promise<string[]> {
  const result: string[] = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isFile() && MSG_PATTERN.test(entry.name)) {
      result.push(fullPath);
    } else if (entry.isDirectory()) {
      result.push(...(await findMsgResourceFiles(fullPath)));
    }
  }
  return result;
}

/**
 * Dynamically imports MsgResource objects from .msg. files and groups them by project.
 * @param filePaths - Array of paths to .msg. files
 * @returns Promise resolving to Map of MsgProject keys and MsgResource array values
 */
export async function importMsgResources(
  filePaths: string[]
): Promise<Map<MsgProject, MsgResource[]>> {
  const byProjectName = new Map<string, { project: MsgProject; resources: MsgResource[] }>();
  for (const filePath of filePaths) {
    if (!MSG_PATTERN.test(filePath)) {
      throw new Error(`File does not have .msg. in filename: ${filePath}`);
    }
    const url = pathToFileURL(filePath).href;
    const mod = await import(url);
    const resource: MsgResource | undefined =
      mod.default ?? mod.resource ?? mod.MsgResource;
    if (!isMsgResourceLike(resource)) {
      throw new Error(
        `Failed to import MsgResource from ${filePath}: no valid export found`
      );
    }
    const project = resource.getProject();
    const projectName = project.project.name;
    let group = byProjectName.get(projectName);
    if (!group) {
      group = { project, resources: [] };
      byProjectName.set(projectName, group);
    }
    group.resources.push(resource);
  }
  const result = new Map<MsgProject, MsgResource[]>();
  for (const { project, resources } of byProjectName.values()) {
    result.set(project, resources);
  }
  return result;
}

/**
 * Serializes MsgResource arrays into monolingual XLIFF 1.2 strings per project.
 * @param resources - Array of MsgResource objects
 * @returns Promise resolving to Map of MsgProject keys and xliff string values
 */
export async function resourcesToXliffString(
  resources: MsgResource[]
): Promise<Map<MsgProject, string>> {
  const byProject = new Map<MsgProject, MsgResource[]>();
  for (const resource of resources) {
    const project = resource.getProject();
    let arr = byProject.get(project);
    if (!arr) {
      arr = [];
      byProject.set(project, arr);
    }
    arr.push(resource);
  }
  const result = new Map<MsgProject, string>();
  for (const [project, arr] of byProject) {
    const xliff = serializeResourcesToXliff(arr);
    result.set(project, xliff);
  }
  return result;
}

function serializeResourcesToXliff(resources: MsgResource[]): string {
  const xmlns = "urn:oasis:names:tc:xliff:document:1.2";
  const parts: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<xliff version="1.2" xmlns="${xmlns}">`,
  ];
  for (const resource of resources) {
    const orig = `${resource.title}.json`;
    const sourceLang = resource.attributes.lang || "en";
    const data = resource.getData(false);
    parts.push(
      `  <file original="${escapeXml(orig)}" source-language="${escapeXml(sourceLang)}" datatype="plaintext">`
    );
    parts.push("    <body>");
    for (const msg of data.messages || []) {
      const key = msg.key;
      const value = msg.value;
      const attrs: string[] = [`id="${escapeXml(key)}"`, `resname="${escapeXml(key)}"`];
      parts.push(`      <trans-unit ${attrs.join(" ")}>`);
      parts.push(`        <source>${escapeXml(value)}</source>`);
      parts.push(`      </trans-unit>`);
    }
    parts.push("    </body>");
    parts.push("  </file>");
  }
  parts.push("</xliff>");
  return parts.join("\n");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Writes an XLIFF 1.2 string to a file with appropriate indentation.
 * @param filePath - The destination file path
 * @param xliff - The serialized XLIFF 1.2 string
 */
export async function writeXliff(
  filePath: string,
  xliff: string
): Promise<void> {
  await writeFile(filePath, xliff, "utf-8");
}

/**
 * Reads XLIFF 1.2 content from a file.
 * @param filePath - The path to the XLIFF file
 * @returns Promise resolving to the XLIFF string content
 */
export async function readXliff(filePath: string): Promise<string> {
  return readFile(filePath, "utf-8");
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

/**
 * Parses an XLIFF 1.2 string into a javascript object, preserving notes and attributes.
 * @param xliff - Valid XLIFF 1.2 string
 * @returns Promise resolving to parsed object
 */
export async function parseXliff(xliff: string): Promise<object> {
  try {
    const parsed = xmlParser.parse(xliff);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Invalid XLIFF: failed to parse");
    }
    return parsed;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to parse XLIFF";
    throw new Error(`Invalid XLIFF 1.2: ${message}`);
  }
}

/**
 * Extracts MsgResourceData from parsed XLIFF 1.2 object.
 * @param parsedXliff - Parsed XLIFF 1.2 javascript object
 * @returns Promise resolving to array of MsgResourceData objects
 */
export async function xliffDataToResourceTranslationData(
  parsedXliff: object
): Promise<MsgResourceData[]> {
  const result: MsgResourceData[] = [];
  const xliff = parsedXliff as {
    "xliff"?: { "file"?: object | object[] };
  };
  const fileEl = xliff?.xliff?.file;
  if (!fileEl) return result;
  const files = Array.isArray(fileEl) ? fileEl : [fileEl];
  for (const file of files) {
    const f = file as {
      "@_original"?: string;
      "@_target-language"?: string;
      "@_source-language"?: string;
      body?: { "trans-unit"?: object | object[] };
    };
    const orig = f["@_original"] ?? "unknown";
    const title = basename(orig, extname(orig)) || orig;
    const targetLang = f["@_target-language"] ?? f["@_source-language"] ?? "";
    const transUnits = f.body?.["trans-unit"];
    const units = Array.isArray(transUnits) ? transUnits : transUnits ? [transUnits] : [];
    const messages: { key: string; value: string }[] = [];
    for (const tu of units) {
      const t = tu as {
        "@_translate"?: string;
        "@_resname"?: string;
        "@_id"?: string;
        target?: { "#text"?: string };
      };
      const translate = (t["@_translate"] ?? "yes").toLowerCase();
      if (translate === "no" || translate === "false") continue;
      const key = t["@_resname"] ?? t["@_id"] ?? "";
      const targetEl = t.target;
      const value =
        (typeof targetEl === "object" && targetEl && "#text" in targetEl
          ? (targetEl as { "#text"?: string })["#text"]
          : typeof targetEl === "string"
            ? targetEl
            : "") ?? "";
      messages.push({ key, value });
    }
    result.push({
      title,
      attributes: { lang: targetLang, dir: "", dnt: false },
      messages,
    });
  }
  return result;
}

/**
 * Parses XLIFF 1.2 string and extracts translation data to MsgResourceData objects.
 * @param xliff - Valid XLIFF 1.2 string
 * @returns Promise resolving to array of MsgResourceData objects
 */
export async function xliffToTranslationData(
  xliff: string
): Promise<MsgResourceData[]> {
  const parsed = await parseXliff(xliff);
  return xliffDataToResourceTranslationData(parsed);
}

/**
 * Serializes MsgResourceData to JSON and writes it to a file.
 * @param filePath - The destination file path
 * @param data - MsgResourceData object to serialize
 */
export async function writeTranslationData(
  filePath: string,
  data: MsgResourceData
): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  await writeFile(filePath, json, "utf-8");
}
