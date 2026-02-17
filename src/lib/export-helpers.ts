import { MsgResource } from "@worldware/msg";
import { readdir, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { pathToFileURL } from "url";
import { dynamicImportFromUrl } from "./create-resource-helpers.js";

/** Object grouping resources with their project name (spec: resource group object). */
export interface ResourceGroup {
  project: string;
  resources: MsgResource[];
}

/** Object grouping an XLIFF string with project name for filename (spec: xliff group object). */
export interface XliffGroup {
  project: string;
  xliff: string;
}

const MSG_PATTERN = /\.msg\.(ts|js)$/i;

const XLIFF20_NS = "urn:oasis:names:tc:xliff:document:2.0";

/**
 * Recursively finds all MsgResource files inside a directory (e.g. i18n/resources).
 * Files must match .msg.(ts|js) in the filename.
 * @param directory - Absolute path to the resources directory
 * @returns Promise resolving to array of file paths
 * @throws Error if directory cannot be read (e.g. does not exist)
 */
export async function findMsgResourceFilePaths(
  directory: string
): Promise<string[]> {
  const result: string[] = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isFile() && MSG_PATTERN.test(entry.name)) {
      result.push(fullPath);
    } else if (entry.isDirectory()) {
      result.push(...(await findMsgResourceFilePaths(fullPath)));
    }
  }
  return result;
}

/**
 * Dynamically imports MsgResource objects from an array of file paths.
 * @param filePaths - Array of absolute paths to .msg.(ts|js) files
 * @returns Promise resolving to array of MsgResource instances
 * @throws Error if any file cannot be imported as a valid MsgResource
 */
export async function importMsgResourcesFromPaths(
  filePaths: string[]
): Promise<MsgResource[]> {
  const result: MsgResource[] = [];
  for (const filePath of filePaths) {
    if (!MSG_PATTERN.test(filePath)) {
      throw new Error(`File does not have .msg. in filename: ${filePath}`);
    }
    const url = pathToFileURL(filePath).href;
    const mod = await dynamicImportFromUrl(url);
    const resource: unknown =
      mod.default ?? (mod as { resource?: unknown }).resource ?? (mod as { MsgResource?: unknown }).MsgResource;
    if (!resource || !(resource instanceof MsgResource)) {
      throw new Error(
        `Failed to import MsgResource from ${filePath}: no valid export found`
      );
    }
    result.push(resource as MsgResource);
  }
  return result;
}

/**
 * Groups MsgResource objects by their associated project name.
 * @param resources - Array of MsgResource instances
 * @returns Array of resource group objects { project, resources }
 */
export function groupResourcesByProject(
  resources: MsgResource[]
): ResourceGroup[] {
  const byProject = new Map<string, MsgResource[]>();
  for (const resource of resources) {
    const projectName = resource.getProject().project.name;
    let arr = byProject.get(projectName);
    if (!arr) {
      arr = [];
      byProject.set(projectName, arr);
    }
    arr.push(resource);
  }
  return Array.from(byProject.entries(), ([project, resources]) => ({
    project,
    resources,
  }));
}

/**
 * Filters resource groups to a single project by name.
 * @param groups - Array of resource group objects
 * @param projectName - Project name to keep
 * @returns Filtered array (empty if no match)
 */
export function filterResourceGroupsByProject(
  groups: ResourceGroup[],
  projectName: string
): ResourceGroup[] {
  return groups.filter((g) => g.project === projectName);
}

/**
 * Escapes a string for use in XML attribute or text content.
 */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Serializes a single ResourceGroup to an XLIFF 2.0 document string.
 * Preserves message keys (as unit id), source text, and resource/file structure.
 */
function resourceGroupToXliff20(group: ResourceGroup): string {
  const srcLang = group.resources[0]?.attributes?.lang ?? "en";
  const parts: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<xliff xmlns="${XLIFF20_NS}" version="2.0" srcLang="${escapeXml(srcLang)}">`,
  ];
  let fileIndex = 0;
  for (const resource of group.resources) {
    const orig = `${resource.title}.json`;
    fileIndex += 1;
    const fileId = `f${fileIndex}`;
    parts.push(
      `  <file id="${fileId}" original="${escapeXml(orig)}">`
    );
    const data = resource.getData(false);
    const messages = data.messages ?? [];
    messages.forEach((msg, idx) => {
      const unitId = `u${fileIndex}-${idx + 1}`;
      parts.push(`    <unit id="${unitId}">`);
      parts.push("      <segment>");
      parts.push(`        <source>${escapeXml(msg.value)}</source>`);
      parts.push("      </segment>");
      parts.push("    </unit>");
    });
    parts.push("  </file>");
  }
  parts.push("</xliff>");
  return parts.join("\n");
}

/**
 * Serializes each resource group to an XLIFF 2.0 string.
 * @param groups - Array of resource group objects
 * @returns Array of xliff group objects { project, xliff }
 */
export function serializeResourceGroupsToXliff(
  groups: ResourceGroup[]
): XliffGroup[] {
  return groups.map((group) => ({
    project: group.project,
    xliff: resourceGroupToXliff20(group),
  }));
}

/**
 * Writes each XLIFF string to a file in the given directory; filename is project name.
 * Ensures the output directory exists.
 * @param xliffDir - Absolute path to l10n/xliff directory
 * @param xliffGroups - Array of { project, xliff } objects
 */
export async function writeXliffFiles(
  xliffDir: string,
  xliffGroups: XliffGroup[]
): Promise<void> {
  await mkdir(xliffDir, { recursive: true });
  for (const { project, xliff } of xliffGroups) {
    const filePath = join(xliffDir, `${project}.xliff`);
    await writeFile(filePath, xliff, "utf-8");
  }
}
