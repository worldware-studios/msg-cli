import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";

/** Default relative path for the i18n directory. */
export const DEFAULT_I18N_DIR = "src/i18n";

/** Default relative path for the l10n directory. */
export const DEFAULT_L10N_DIR = "res/l10n";

/** Minimal type for package.json fields we read/write. */
export interface PackageJson {
  name?: string;
  directories?: Record<string, string>;
  imports?: Record<string, string>;
  scripts?: Record<string, string>;
  [key: string]: unknown;
}

/**
 * Finds package.json by walking up from the given directory.
 * @param cwd - Directory to start from (e.g. process.cwd())
 * @returns Absolute path to package.json, or null if not found
 */
export function findPackageJsonPath(cwd: string): string | null {
  let dir = cwd;
  for (;;) {
    const p = join(dir, "package.json");
    if (existsSync(p)) return p;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Reads and parses package.json.
 * @param pkgPath - Absolute path to package.json
 * @returns Parsed package.json object
 * @throws Error if file is unreadable or invalid JSON
 */
export function readPackageJson(pkgPath: string): PackageJson {
  const raw = readFileSync(pkgPath, "utf-8");
  try {
    const parsed = JSON.parse(raw) as PackageJson;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("package.json must be a JSON object");
    }
    return parsed;
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error("Invalid package.json: " + err.message);
    }
    throw err;
  }
}

/** Result of loadPackageJsonForMsg - shared package.json context for msg commands. */
export interface MsgPackageContext {
  pkgPath: string;
  rootDir: string;
  pkg: PackageJson;
  i18nDir: string;
  l10nDir?: string;
  isEsm: boolean;
  useTypeScript: boolean;
}

/**
 * Loads package.json for msg commands (create project, create resource, etc.).
 * Finds package.json from cwd, validates directories, and derives module info.
 * @param cwd - Directory to start from (e.g. process.cwd())
 * @param options - requireL10n: if true, directories.l10n must exist (default: false)
 * @returns Package context with pkgPath, rootDir, pkg, i18nDir, l10nDir?, isEsm, useTypeScript
 * @throws Error if package.json not found or required directories missing
 */
export function loadPackageJsonForMsg(
  cwd: string,
  options?: { requireL10n?: boolean }
): MsgPackageContext {
  const pkgPath = findPackageJsonPath(cwd);
  if (!pkgPath) {
    throw new Error("package.json not found. Run this command from the project root.");
  }
  let pkg: PackageJson;
  try {
    pkg = readPackageJson(pkgPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "package.json could not be parsed.";
    throw new Error(msg);
  }
  const dirs = pkg.directories;
  if (!dirs || typeof dirs !== "object" || !dirs.i18n) {
    throw new Error("package.json must contain directories.i18n. Run 'msg init' first.");
  }
  if (options?.requireL10n && !dirs.l10n) {
    throw new Error(
      "package.json must contain directories.i18n and directories.l10n. Run 'msg init' first."
    );
  }
  const rootDir = dirname(pkgPath);
  const useTypeScript = existsSync(join(rootDir, "tsconfig.json"));
  const isEsm = (pkg as { type?: string }).type === "module";
  return {
    pkgPath,
    rootDir,
    pkg,
    i18nDir: dirs.i18n,
    l10nDir: dirs.l10n,
    isEsm,
    useTypeScript,
  };
}

/**
 * Writes package.json to disk with trailing newline.
 * @param pkgPath - Absolute path to package.json
 * @param pkg - Object to serialize
 */
export function writePackageJson(pkgPath: string, pkg: PackageJson): void {
  const json = JSON.stringify(pkg, null, 2) + "\n";
  writeFileSync(pkgPath, json, "utf-8");
}

/**
 * Validates i18n and l10n paths (relative, non-empty, no absolute segments).
 * @param rootDir - Project root (absolute)
 * @param i18nDir - Relative i18n path
 * @param l10nDir - Relative l10n path
 * @returns Object with valid: boolean and optional error message
 */
export function validatePaths(
  rootDir: string,
  i18nDir: string,
  l10nDir: string
): { valid: true } | { valid: false; error: string } {
  const trimmedI18n = i18nDir.trim();
  const trimmedL10n = l10nDir.trim();
  if (!trimmedI18n) return { valid: false, error: "i18n directory path cannot be empty" };
  if (!trimmedL10n) return { valid: false, error: "l10n directory path cannot be empty" };
  if (trimmedI18n.startsWith("/") || /^[A-Za-z]:/.test(trimmedI18n)) {
    return { valid: false, error: "i18n path must be relative" };
  }
  if (trimmedL10n.startsWith("/") || /^[A-Za-z]:/.test(trimmedL10n)) {
    return { valid: false, error: "l10n path must be relative" };
  }
  return { valid: true };
}

const GITKEEP = ".gitkeep";

/**
 * Ensures i18n and l10n directory trees exist and adds .gitkeep to leaf dirs.
 * Leaf dirs: i18n/projects, i18n/resources, l10n/translations, l10n/xliff.
 * @param rootDir - Project root (absolute)
 * @param i18nDir - Relative i18n path
 * @param l10nDir - Relative l10n path
 * @param force - If true, overwrite/recreate even when dirs exist or are non-empty
 */
export function ensureDirectoriesWithGitkeep(
  rootDir: string,
  i18nDir: string,
  l10nDir: string,
  force: boolean
): void {
  const leaves = [
    join(rootDir, i18nDir, "projects"),
    join(rootDir, i18nDir, "resources"),
    join(rootDir, l10nDir, "translations"),
    join(rootDir, l10nDir, "xliff"),
  ];

  for (const leaf of leaves) {
    const parent = dirname(leaf);
    if (!existsSync(parent)) {
      mkdirSync(parent, { recursive: true });
    }
    if (!existsSync(leaf)) {
      mkdirSync(leaf, { recursive: true });
    }
    const gitkeepPath = join(leaf, GITKEEP);
    if (force || !existsSync(gitkeepPath)) {
      writeFileSync(gitkeepPath, "", "utf-8");
    }
  }
}

/**
 * Returns true if package.json already has msg directories and they exist on disk.
 */
export function isAlreadyInitialized(
  pkg: PackageJson,
  rootDir: string,
  i18nDir: string,
  l10nDir: string
): boolean {
  const dirs = pkg.directories;
  if (!dirs || typeof dirs !== "object") return false;
  if (dirs.i18n !== i18nDir || dirs.l10n !== l10nDir) return false;
  const i18nFull = join(rootDir, i18nDir);
  const l10nFull = join(rootDir, l10nDir);
  return existsSync(i18nFull) && existsSync(l10nFull);
}

/**
 * Adds or overwrites directories.i18n, directories.l10n, directories.root in package.json.
 */
export function addDirectoriesToPackageJson(
  pkg: PackageJson,
  i18nDir: string,
  l10nDir: string
): PackageJson {
  const directories = { ...pkg.directories, i18n: i18nDir, l10n: l10nDir, root: "." };
  return { ...pkg, directories };
}

/**
 * Adds import aliases #i18n/*, #l10n/*, #root/* to package.json imports.
 */
export function addImportAliasesToPackageJson(
  pkg: PackageJson,
  i18nDir: string,
  l10nDir: string
): PackageJson {
  const imports = {
    ...pkg.imports,
    "#i18n/*": `./${i18nDir}/*`,
    "#l10n/*": `./${l10nDir}/*`,
    "#root/*": "./*",
  };
  return { ...pkg, imports };
}

/**
 * Adds i18n-export and l10n-import scripts to package.json.
 */
export function addScriptsToPackageJson(pkg: PackageJson): PackageJson {
  const scripts = {
    ...pkg.scripts,
    "i18n-export": "msg export",
    "l10n-import": "msg import",
  };
  return { ...pkg, scripts };
}

/**
 * Reads tsconfig.json, adds baseUrl and paths for #i18n/*, #l10n/*, #root/*, and writes it back.
 * Merges into existing compilerOptions.paths and compilerOptions.baseUrl if present.
 * @param tsconfigPath - Absolute path to tsconfig.json
 * @param i18nDir - Relative i18n path
 * @param l10nDir - Relative l10n path
 */
export function addTsconfigPaths(
  tsconfigPath: string,
  i18nDir: string,
  l10nDir: string
): void {
  const raw = readFileSync(tsconfigPath, "utf-8");
  let config: { compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> } };
  try {
    config = JSON.parse(raw) as typeof config;
  } catch {
    throw new Error("Invalid tsconfig.json");
  }
  if (!config.compilerOptions) config.compilerOptions = {};
  const co = config.compilerOptions;
  co.baseUrl = co.baseUrl ?? ".";
  co.paths = {
    ...co.paths,
    "#i18n/*": [`./${i18nDir}/*`],
    "#l10n/*": [`./${l10nDir}/*`],
    "#root/*": ["./*"],
  };
  writeFileSync(tsconfigPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}
