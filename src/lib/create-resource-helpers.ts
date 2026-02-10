import { existsSync, mkdirSync, writeFileSync } from "fs";
import { createRequire } from "module";
import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { loadPackageJsonForMsg } from "./init-helpers.js";

/**
 * Dynamically import a module from a file URL.
 * Tries native import() first; on VM/runner errors (e.g. Vitest "dynamic import
 * callback was not specified") falls back to require() so CJS files load.
 */
export async function dynamicImportFromUrl(
  url: string
): Promise<Record<string, unknown>> {
  try {
    return (await import(/* @vite-ignore */ url)) as Promise<
      Record<string, unknown>
    >;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const useRequire =
      msg.includes("dynamic import callback") || msg.includes("ERR_VM_DYNAMIC_IMPORT");
    if (useRequire) {
      try {
        const path = url.startsWith("file:") ? fileURLToPath(url) : url;
        const base = pathToFileURL(process.cwd()).href;
        const req = createRequire(base);
        const mod = req(path) as Record<string, unknown>;
        return Promise.resolve(mod ?? {});
      } catch {
        // fall through to rethrow original
      }
    }
    throw err;
  }
}

/** Result of reading package.json for create-resource (i18n dir, module type). */
export interface PackageJsonForCreateResource {
  i18nDir: string;
  isEsm: boolean;
  useTypeScript: boolean;
}

/** Minimal type for MsgProject-like data we read to get sourceLocale and dir. */
export interface MsgProjectForResource {
  locales?: { sourceLocale?: string };
}

/**
 * Reads package.json and returns i18n directory and module type info.
 * @param cwd - Directory to start from (e.g. process.cwd())
 * @returns Object with i18nDir, isEsm, useTypeScript
 * @throws Error if package.json not found or missing directories.i18n
 */
export function readPackageJsonForCreateResource(
  cwd: string
): PackageJsonForCreateResource {
  const ctx = loadPackageJsonForMsg(cwd);
  return {
    i18nDir: ctx.i18nDir,
    isEsm: ctx.isEsm,
    useTypeScript: ctx.useTypeScript,
  };
}

/**
 * Derives dir (ltr/rtl) from a locale string based on language subtag.
 * @param sourceLocale - Full locale (e.g. "en", "ar-SA", "he-IL")
 * @returns "rtl" for ar/he, "ltr" otherwise
 */
function dirFromSourceLocale(sourceLocale: string): "ltr" | "rtl" {
  const lang = sourceLocale.split("-")[0]?.toLowerCase() ?? "";
  return lang === "ar" || lang === "he" ? "rtl" : "ltr";
}

/**
 * Imports the MsgProject module and returns sourceLocale and dir (ltr/rtl).
 * @param projectsDir - Absolute path to i18n/projects
 * @param projectName - Name of the project file (without extension)
 * @returns Object with sourceLocale and dir, or undefined if project not found
 */
export async function importMsgProjectForResource(
  projectsDir: string,
  projectName: string
): Promise<{ sourceLocale: string; dir: "ltr" | "rtl" } | undefined> {
  const basePath = join(projectsDir, projectName);
  const exts = [".ts", ".js"];
  for (const ext of exts) {
    const p = `${basePath}${ext}`;
    if (existsSync(p)) {
      try {
        const url = pathToFileURL(p).href;
        const mod = await dynamicImportFromUrl(url);
        const data = (mod?.default ?? mod) as MsgProjectForResource;
        const sourceLocale = data?.locales?.sourceLocale;
        if (!sourceLocale || typeof sourceLocale !== "string") {
          throw new Error(
            `Project file must export a default with locales.sourceLocale (got ${typeof data?.locales?.sourceLocale}).`
          );
        }
        return {
          sourceLocale,
          dir: dirFromSourceLocale(sourceLocale),
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Project file '${projectName}${ext}' could not be loaded: ${message}`
        );
      }
    }
  }
  return undefined;
}

/**
 * Generates the MsgResource file content as a string.
 * @param params - Title, projectName, sourceLocale, dir, and isEsm
 * @returns The generated file content
 */
export function generateMsgResourceContent(params: {
  title: string;
  projectName: string;
  sourceLocale: string;
  dir: "ltr" | "rtl";
  isEsm: boolean;
}): string {
  const { title, projectName, sourceLocale, dir, isEsm } = params;
  const projectImport = isEsm
    ? `../projects/${projectName}.js`
    : `../projects/${projectName}`;
  const messagesBlock = `  messages: [
    {
      key: 'example.message',
      value: 'Example message.',
      notes: [
        { type: 'description', content: 'This is an example message. You can delete it.' }
      ]
    }
  ]`;

  const titleStr = `'${title.replace(/'/g, "\\'")}'`;
  const langStr = `'${sourceLocale.replace(/'/g, "\\'")}'`;
  const dirStr = `'${dir}'`;

  if (isEsm) {
    return `import { MsgResource } from '@worldware/msg';
import project from '${projectImport}';

export default MsgResource.create({
  title: ${titleStr},
  attributes: {
    lang: ${langStr},
    dir: ${dirStr}
  },
  notes: [
    { type: 'DESCRIPTION', content: 'This is a generated file. Replace this description with your own.' }
  ],
${messagesBlock}
}, project);
`;
  }

  return `const { MsgResource } = require('@worldware/msg');
const project = require('${projectImport}');

module.exports = MsgResource.create({
  title: ${titleStr},
  attributes: {
    lang: ${langStr},
    dir: ${dirStr}
  },
  notes: [
    { type: 'DESCRIPTION', content: 'This is a generated file. Replace this description with your own.' }
  ],
${messagesBlock}
}, project);
`;
}

/**
 * Writes the MsgResource content to file.
 * @param filePath - Absolute path of the file to write (including extension)
 * @param content - Full file content string
 */
export function writeMsgResourceFile(filePath: string, content: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, content, "utf-8");
}
