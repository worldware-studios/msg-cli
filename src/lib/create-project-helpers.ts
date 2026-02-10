import { existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join, relative } from "path";
import { pathToFileURL } from "url";
import { dynamicImportFromUrl } from "./create-resource-helpers.js";
import type { PackageJson } from "./init-helpers.js";
import { loadPackageJsonForMsg } from "./init-helpers.js";

/** Minimal type for MsgProject-like data we read from an existing project file. */
export interface MsgProjectFileData {
  project?: { name?: string; version?: number };
  locales?: {
    sourceLocale?: string;
    pseudoLocale?: string;
    targetLocales?: Record<string, string[]>;
  };
  loader?: unknown;
}

/**
 * Calculates the relative path from the i18n projects directory to the l10n translations directory.
 * @param projectsDir - Absolute path to i18n/projects (e.g. root/i18n/projects)
 * @param translationsDir - Absolute path to l10n/translations (e.g. root/l10n/translations)
 * @returns Relative path string from projects to translations, suitable for import()
 */
export function calculateRelativePath(projectsDir: string, translationsDir: string): string {
  const rel = relative(projectsDir, translationsDir);
  return rel.startsWith(".") ? rel : `./${rel}`;
}

/**
 * Imports an existing MsgProject module from the projects directory.
 * @param projectsDir - Absolute path to i18n/projects
 * @param projectName - Name of the project (file name without extension)
 * @returns The default export (MsgProject instance or data) or undefined if not found
 */
export async function importMsgProjectFile(
  projectsDir: string,
  projectName: string
): Promise<MsgProjectFileData | undefined> {
  const basePath = join(projectsDir, projectName);
  const exts = [".ts", ".js"];
  for (const ext of exts) {
    const p = `${basePath}${ext}`;
    if (existsSync(p)) {
      try {
        const url = pathToFileURL(p).href;
        const mod = await dynamicImportFromUrl(url);
        return (mod?.default ?? mod) as MsgProjectFileData;
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/**
 * Writes an MsgProject file to the projects directory.
 * @param filePath - Absolute path of the file to write (including extension)
 * @param content - Full file content string
 */
export function writeMsgProjectFile(filePath: string, content: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, content, "utf-8");
}

/**
 * Loads package.json from the given directory (walking up to find it).
 * Requires directories.i18n and directories.l10n.
 * @param cwd - Directory to start from (e.g. process.cwd())
 * @returns Parsed package.json with directories.i18n and directories.l10n
 * @throws Error if package.json not found or missing directories.i18n / directories.l10n
 */
export function loadPackageJsonForCreateProject(cwd: string): PackageJson & {
  directories: { i18n: string; l10n: string };
} {
  const ctx = loadPackageJsonForMsg(cwd, { requireL10n: true });
  return ctx.pkg as PackageJson & { directories: { i18n: string; l10n: string } };
}
