import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { dirname } from "path";
import { fileURLToPath } from "url";
import {
  DEFAULT_I18N_DIR,
  DEFAULT_L10N_DIR,
  addDirectoriesToPackageJson,
  addImportAliasesToPackageJson,
  addScriptsToPackageJson,
  addTsconfigPaths,
  ensureDirectoriesWithGitkeep,
  findPackageJsonPath,
  isAlreadyInitialized,
  readPackageJson,
  validatePaths,
  writePackageJson,
} from "../lib/init-helpers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "fixtures", "init");

describe("init-helpers", () => {
  describe("findPackageJsonPath", () => {
    test("returns path when package.json exists in cwd", () => {
      const p = findPackageJsonPath(join(FIXTURES, "fresh"));
      expect(p).toBe(join(FIXTURES, "fresh", "package.json"));
    });

    test("returns null when no package.json up the tree", () => {
      const p = findPackageJsonPath(tmpdir());
      expect(p).toBeNull();
    });
  });

  describe("readPackageJson", () => {
    test("parses valid package.json", () => {
      const p = readPackageJson(join(FIXTURES, "fresh", "package.json"));
      expect(p.name).toBe("test-app");
      expect(p.version).toBe("1.0.0");
    });

    test("throws on invalid JSON", () => {
      const badPath = join(tmpdir(), `msg-init-test-bad-${Date.now()}.json`);
      writeFileSync(badPath, "{ invalid");
      try {
        expect(() => readPackageJson(badPath)).toThrow(/Invalid package\.json/);
      } finally {
        rmSync(badPath, { force: true });
      }
    });

    test("throws when JSON is null (not an object)", () => {
      const badPath = join(tmpdir(), `msg-init-test-null-${Date.now()}.json`);
      writeFileSync(badPath, "null");
      try {
        expect(() => readPackageJson(badPath)).toThrow("package.json must be a JSON object");
      } finally {
        rmSync(badPath, { force: true });
      }
    });

    test("throws when JSON is array (not an object)", () => {
      const badPath = join(tmpdir(), `msg-init-test-array-${Date.now()}.json`);
      writeFileSync(badPath, "[]");
      try {
        expect(() => readPackageJson(badPath)).toThrow("package.json must be a JSON object");
      } finally {
        rmSync(badPath, { force: true });
      }
    });
  });

  describe("validatePaths", () => {
    const root = "/project";

    test("accepts default-like relative paths", () => {
      expect(validatePaths(root, "src/i18n", "res/l10n").valid).toBe(true);
    });

    test("rejects empty i18n path", () => {
      const r = validatePaths(root, "", "res/l10n");
      expect(r.valid).toBe(false);
      expect("error" in r && r.error).toContain("empty");
    });

    test("rejects empty l10n path", () => {
      const r = validatePaths(root, "src/i18n", "  ");
      expect(r.valid).toBe(false);
    });

    test("rejects absolute i18n path", () => {
      const r = validatePaths(root, "/tmp/i18n", "res/l10n");
      expect(r.valid).toBe(false);
      expect("error" in r && r.error).toContain("relative");
    });

    test("rejects Windows-style absolute path", () => {
      const r = validatePaths(root, "C:\\i18n", "res/l10n");
      expect(r.valid).toBe(false);
    });

    test("rejects absolute l10n path", () => {
      const r = validatePaths(root, "src/i18n", "/tmp/l10n");
      expect(r.valid).toBe(false);
      expect("error" in r && r.error).toContain("relative");
    });

    test("rejects Windows-style absolute l10n path", () => {
      const r = validatePaths(root, "src/i18n", "D:\\l10n");
      expect(r.valid).toBe(false);
    });
  });

  describe("ensureDirectoriesWithGitkeep", () => {
    let tmp: string;

    beforeEach(() => {
      tmp = join(tmpdir(), `msg-init-dirs-${Date.now()}`);
      mkdirSync(tmp, { recursive: true });
    });

    afterEach(() => {
      rmSync(tmp, { recursive: true, force: true });
    });

    test("creates i18n and l10n leaf dirs with .gitkeep", () => {
      ensureDirectoriesWithGitkeep(tmp, "src/i18n", "res/l10n", false);
      const leaves = [
        join(tmp, "src", "i18n", "projects", ".gitkeep"),
        join(tmp, "src", "i18n", "resources", ".gitkeep"),
        join(tmp, "res", "l10n", "translations", ".gitkeep"),
        join(tmp, "res", "l10n", "xliff", ".gitkeep"),
      ];
      for (const p of leaves) {
        expect(existsSync(p)).toBe(true);
      }
    });

    test("with custom paths creates correct structure", () => {
      ensureDirectoriesWithGitkeep(tmp, "lib/i18n", "data/l10n", false);
      expect(existsSync(join(tmp, "lib", "i18n", "projects", ".gitkeep"))).toBe(true);
      expect(existsSync(join(tmp, "data", "l10n", "xliff", ".gitkeep"))).toBe(true);
    });

    test("with force overwrites existing .gitkeep", () => {
      ensureDirectoriesWithGitkeep(tmp, "src/i18n", "res/l10n", false);
      const gitkeep = join(tmp, "src", "i18n", "projects", ".gitkeep");
      writeFileSync(gitkeep, "content-before");
      ensureDirectoriesWithGitkeep(tmp, "src/i18n", "res/l10n", true);
      expect(readFileSync(gitkeep, "utf-8")).toBe("");
    });
  });

  describe("addDirectoriesToPackageJson", () => {
    test("adds i18n, l10n, root to directories", () => {
      const pkg = addDirectoriesToPackageJson({ name: "x" }, "src/i18n", "res/l10n");
      expect(pkg.directories?.i18n).toBe("src/i18n");
      expect(pkg.directories?.l10n).toBe("res/l10n");
      expect(pkg.directories?.root).toBe(".");
    });

    test("preserves existing directories keys", () => {
      const pkg = addDirectoriesToPackageJson(
        { directories: { other: "lib" } },
        "src/i18n",
        "res/l10n"
      );
      expect(pkg.directories?.other).toBe("lib");
      expect(pkg.directories?.i18n).toBe("src/i18n");
    });
  });

  describe("addImportAliasesToPackageJson", () => {
    test("adds #i18n/*, #l10n/*, #root/*", () => {
      const pkg = addImportAliasesToPackageJson({ name: "x" }, "src/i18n", "res/l10n");
      expect(pkg.imports?.["#i18n/*"]).toBe("src/i18n/*");
      expect(pkg.imports?.["#l10n/*"]).toBe("res/l10n/*");
      expect(pkg.imports?.["#root/*"]).toBe("./*");
    });
  });

  describe("addScriptsToPackageJson", () => {
    test("adds i18n-export and l10n-import", () => {
      const pkg = addScriptsToPackageJson({ name: "x" });
      expect(pkg.scripts?.["i18n-export"]).toBe("msg export:resources");
      expect(pkg.scripts?.["l10n-import"]).toBe("msg import:translations");
    });

    test("preserves existing scripts", () => {
      const pkg = addScriptsToPackageJson({ scripts: { build: "tsc" } });
      expect(pkg.scripts?.build).toBe("tsc");
      expect(pkg.scripts?.["i18n-export"]).toBe("msg export:resources");
    });
  });

  describe("isAlreadyInitialized", () => {
    let tmp: string;

    beforeEach(() => {
      tmp = join(tmpdir(), `msg-init-check-${Date.now()}`);
      mkdirSync(tmp, { recursive: true });
    });

    afterEach(() => {
      rmSync(tmp, { recursive: true, force: true });
    });

    test("returns false when no directories in package.json", () => {
      expect(isAlreadyInitialized({ name: "x" }, tmp, DEFAULT_I18N_DIR, DEFAULT_L10N_DIR)).toBe(
        false
      );
    });

    test("returns false when directories exist but paths do not match", () => {
      const pkg = { directories: { i18n: "src/i18n", l10n: "res/l10n" } };
      expect(isAlreadyInitialized(pkg, tmp, "other/i18n", "other/l10n")).toBe(false);
    });

    test("returns false when directories in pkg but dirs do not exist on disk", () => {
      const pkg = { directories: { i18n: "src/i18n", l10n: "res/l10n" } };
      expect(isAlreadyInitialized(pkg, tmp, "src/i18n", "res/l10n")).toBe(false);
    });

    test("returns true when directories match and exist", () => {
      mkdirSync(join(tmp, "src", "i18n"), { recursive: true });
      mkdirSync(join(tmp, "res", "l10n"), { recursive: true });
      const pkg = { directories: { i18n: "src/i18n", l10n: "res/l10n" } };
      expect(isAlreadyInitialized(pkg, tmp, "src/i18n", "res/l10n")).toBe(true);
    });
  });

  describe("addTsconfigPaths", () => {
    let tmp: string;

    beforeEach(() => {
      tmp = join(tmpdir(), `msg-init-tsconfig-${Date.now()}`);
      mkdirSync(tmp, { recursive: true });
    });

    afterEach(() => {
      rmSync(tmp, { recursive: true, force: true });
    });

    test("adds baseUrl and paths to tsconfig.json", () => {
      const tsconfigPath = join(tmp, "tsconfig.json");
      writeFileSync(tsconfigPath, '{"compilerOptions":{}}', "utf-8");
      addTsconfigPaths(tsconfigPath, "src/i18n", "res/l10n");
      const content = JSON.parse(readFileSync(tsconfigPath, "utf-8"));
      expect(content.compilerOptions.baseUrl).toBe(".");
      expect(content.compilerOptions.paths["#i18n/*"]).toEqual(["src/i18n/*"]);
      expect(content.compilerOptions.paths["#l10n/*"]).toEqual(["res/l10n/*"]);
      expect(content.compilerOptions.paths["#root/*"]).toEqual(["./*"]);
    });

    test("throws on invalid JSON", () => {
      const tsconfigPath = join(tmp, "tsconfig.json");
      writeFileSync(tsconfigPath, "{ invalid", "utf-8");
      expect(() => addTsconfigPaths(tsconfigPath, "src/i18n", "res/l10n")).toThrow(
        /Invalid tsconfig/
      );
    });
  });

  describe("writePackageJson", () => {
    let tmp: string;

    beforeEach(() => {
      tmp = join(tmpdir(), `msg-init-write-${Date.now()}`);
      mkdirSync(tmp, { recursive: true });
    });

    afterEach(() => {
      rmSync(tmp, { recursive: true, force: true });
    });

    test("writes valid JSON that can be re-read", () => {
      const p = join(tmp, "package.json");
      writePackageJson(p, { name: "written", version: "1.0.0" });
      const back = readPackageJson(p);
      expect(back.name).toBe("written");
      expect(back.version).toBe("1.0.0");
    });
  });
});
