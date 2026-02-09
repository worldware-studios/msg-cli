import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import CreateProject from "../commands/create/project.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_ROOT = join(__dirname, "..", "..");

/**
 * Writes a minimal package.json with directories and ensures i18n/projects exists.
 */
function setupValidProject(tmp: string, pkgOverrides: Record<string, unknown> = {}) {
  const pkg = {
    name: "test-app",
    version: "1.0.0",
    directories: { i18n: "i18n", l10n: "l10n", root: "." },
    ...pkgOverrides,
  };
  writeFileSync(join(tmp, "package.json"), JSON.stringify(pkg, null, 2));
  const i18nProjects = join(tmp, pkg.directories.i18n, "projects");
  if (!existsSync(i18nProjects)) {
    mkdirSync(i18nProjects, { recursive: true });
  }
  const l10nTranslations = join(tmp, pkg.directories.l10n, "translations");
  if (!existsSync(l10nTranslations)) {
    mkdirSync(l10nTranslations, { recursive: true });
  }
}

describe("CreateProject command", () => {
  let tmp: string;
  let origCwd: string;

  beforeEach(() => {
    tmp = join(tmpdir(), `msg-create-project-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    origCwd = process.cwd();
    process.chdir(tmp);
  });

  afterEach(() => {
    process.chdir(origCwd);
    rmSync(tmp, { recursive: true, force: true });
  });

  describe("Help", () => {
    test("create project -h or --help prints help and does not create file", async () => {
      setupValidProject(tmp);
      try {
        await CreateProject.run(["-h"], CLI_ROOT);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (!message.includes("EEXIT") && !message.includes("Parsing --help")) throw err;
      }
      expect(existsSync(join(tmp, "i18n", "projects", "myApp.js"))).toBe(false);
      expect(existsSync(join(tmp, "i18n", "projects", "myApp.ts"))).toBe(false);
    });
  });

  describe("Happy path", () => {
    test("basic project creation with single target", async () => {
      setupValidProject(tmp);
      await CreateProject.run(["myApp", "en", "fr"], CLI_ROOT);

      const ext = existsSync(join(tmp, "tsconfig.json")) ? ".ts" : ".js";
      const outPath = join(tmp, "i18n", "projects", `myApp${ext}`);
      expect(existsSync(outPath)).toBe(true);
      const content = readFileSync(outPath, "utf-8");
      expect(content).toContain("project: { name: \"myApp\"");
      expect(content).toContain("sourceLocale: \"en\"");
      expect(content).toContain("targetLocales");
      expect(content).toMatch(/"en":\s*\["en"\]/);
      expect(content).toMatch(/"fr":\s*\["fr"\]/);
      expect(content).toContain("TRANSLATION_IMPORT_PATH");
      expect(content).toContain("MsgProject.create");
      expect(content).toContain("loader");
    });

    test("project creation with multiple target locales", async () => {
      setupValidProject(tmp);
      await CreateProject.run(["myApp", "en", "fr", "de", "es"], CLI_ROOT);

      const ext = existsSync(join(tmp, "tsconfig.json")) ? ".ts" : ".js";
      const content = readFileSync(join(tmp, "i18n", "projects", `myApp${ext}`), "utf-8");
      expect(content).toMatch(/"en":\s*\["en"\]/);
      expect(content).toMatch(/"fr":\s*\["fr"\]/);
      expect(content).toMatch(/"de":\s*\["de"\]/);
      expect(content).toMatch(/"es":\s*\["es"\]/);
    });

    test("ES module project uses export default", async () => {
      setupValidProject(tmp, { type: "module" });
      await CreateProject.run(["myApp", "en", "fr"], CLI_ROOT);

      const ext = existsSync(join(tmp, "tsconfig.json")) ? ".ts" : ".js";
      const content = readFileSync(join(tmp, "i18n", "projects", `myApp${ext}`), "utf-8");
      expect(content).toContain("import { MsgProject }");
      expect(content).toContain("export default MsgProject.create");
      expect(content).not.toContain("module.exports");
    });

    test("CommonJS project uses module.exports", async () => {
      setupValidProject(tmp);
      await CreateProject.run(["myApp", "en", "fr"], CLI_ROOT);

      const content = readFileSync(join(tmp, "i18n", "projects", "myApp.js"), "utf-8");
      expect(content).toContain("require('@worldware/msg')");
      expect(content).toContain("module.exports = MsgProject.create");
      expect(content).not.toContain("export default");
    });

    test("TypeScript project writes .ts file", async () => {
      setupValidProject(tmp);
      writeFileSync(join(tmp, "tsconfig.json"), JSON.stringify({ compilerOptions: {} }));
      await CreateProject.run(["myApp", "en", "fr"], CLI_ROOT);

      expect(existsSync(join(tmp, "i18n", "projects", "myApp.ts"))).toBe(true);
      expect(existsSync(join(tmp, "i18n", "projects", "myApp.js"))).toBe(false);
    });

    test("JavaScript project without tsconfig writes .js file", async () => {
      setupValidProject(tmp);
      await CreateProject.run(["myApp", "en", "fr"], CLI_ROOT);

      expect(existsSync(join(tmp, "i18n", "projects", "myApp.js"))).toBe(true);
    });

    test("single target locale", async () => {
      setupValidProject(tmp);
      await CreateProject.run(["myApp", "en", "fr"], CLI_ROOT);

      const content = readFileSync(join(tmp, "i18n", "projects", "myApp.js"), "utf-8");
      expect(content).toMatch(/"fr":\s*\["fr"\]/);
    });

    test("source locale same as one target", async () => {
      setupValidProject(tmp);
      await CreateProject.run(["myApp", "en", "en", "fr"], CLI_ROOT);

      const content = readFileSync(join(tmp, "i18n", "projects", "myApp.js"), "utf-8");
      expect(content).toMatch(/"en":\s*\["en"\]/);
      expect(content).toMatch(/"fr":\s*\["fr"\]/);
    });

    test("extend existing project merges data", async () => {
      setupValidProject(tmp);
      // Write a minimal base project (no @worldware/msg) so dynamic import works in test
      const baseContent = `module.exports = {
  project: { name: 'base', version: 1 },
  locales: { sourceLocale: 'en', pseudoLocale: 'zxx', targetLocales: { en: ['en'], fr: ['fr'] } },
  loader: async () => ({ title: '', attributes: { lang: '', dir: '' }, notes: [], messages: [] })
};`;
      writeFileSync(join(tmp, "i18n", "projects", "base.js"), baseContent);
      await CreateProject.run(["extendedApp", "en", "de", "--extend", "base"], CLI_ROOT);

      const ext = existsSync(join(tmp, "tsconfig.json")) ? ".ts" : ".js";
      const outPath = join(tmp, "i18n", "projects", "extendedApp" + ext);
      expect(existsSync(outPath)).toBe(true);
      const content = readFileSync(outPath, "utf-8");
      expect(content).toContain("extendedApp");
      expect(content).toContain("sourceLocale");
      expect(content).toMatch(/"de":\s*\["de"\]/);
      expect(content).toMatch(/"en":\s*\["en"\]/);
      // Merged pseudoLocale from base
      expect(content).toContain("zxx");
    });
  });

  describe("Edge cases", () => {
    test("custom i18n and l10n paths in package.json", async () => {
      setupValidProject(tmp, {
        directories: { i18n: "lib/i18n", l10n: "data/l10n", root: "." },
      });
      mkdirSync(join(tmp, "lib", "i18n", "projects"), { recursive: true });
      mkdirSync(join(tmp, "data", "l10n", "translations"), { recursive: true });
      await CreateProject.run(["myApp", "en", "fr"], CLI_ROOT);

      const outPath = join(tmp, "lib", "i18n", "projects", "myApp.js");
      expect(existsSync(outPath)).toBe(true);
      const content = readFileSync(outPath, "utf-8");
      // Loader path from lib/i18n/projects to data/l10n/translations
      expect(content).toContain("data/l10n/translations");
    });
  });

  describe("Errors", () => {
    test("missing projectName fails with error", async () => {
      setupValidProject(tmp);
      await expect(CreateProject.run([], CLI_ROOT)).rejects.toThrow(
        /projectName is required|Missing.*required arg/
      );
      await expect(
        CreateProject.run(["", "en", "fr"], CLI_ROOT)
      ).rejects.toThrow(/projectName is required/);
    });

    test("missing source locale fails with error", async () => {
      setupValidProject(tmp);
      await expect(CreateProject.run(["myApp"], CLI_ROOT)).rejects.toThrow(
        /source.*required|Missing.*required arg/
      );
      await expect(
        CreateProject.run(["myApp", "", "fr"], CLI_ROOT)
      ).rejects.toThrow(/source.*required/);
    });

    test("missing target locales fails with error", async () => {
      setupValidProject(tmp);
      await expect(CreateProject.run(["myApp", "en"], CLI_ROOT)).rejects.toThrow(
        /At least one target locale is required|Missing.*required arg/
      );
    });

    test("package.json not found fails with error", async () => {
      await expect(CreateProject.run(["myApp", "en", "fr"], CLI_ROOT)).rejects.toThrow(
        /package\.json not found|Run this command from the project root/
      );
    });

    test("existing MsgProject file with same name fails", async () => {
      setupValidProject(tmp);
      await CreateProject.run(["myApp", "en", "fr"], CLI_ROOT);
      await expect(CreateProject.run(["myApp", "en", "de"], CLI_ROOT)).rejects.toThrow(
        /already exists/
      );
    });

    test("i18n or l10n directories not configured fails", async () => {
      writeFileSync(join(tmp, "package.json"), JSON.stringify({ name: "app" }));
      mkdirSync(join(tmp, "i18n", "projects"), { recursive: true });
      await expect(CreateProject.run(["myApp", "en", "fr"], CLI_ROOT)).rejects.toThrow(
        /directories\.i18n and directories\.l10n|Run 'msg init' first/
      );
    });

    test("extend non-existent project fails", async () => {
      setupValidProject(tmp);
      await expect(
        CreateProject.run(["myApp", "en", "fr", "--extend", "nonexistent"], CLI_ROOT)
      ).rejects.toThrow(/could not be found to extend/);
    });

    test("malformed package.json fails", async () => {
      writeFileSync(join(tmp, "package.json"), "{ invalid json");
      mkdirSync(join(tmp, "i18n", "projects"), { recursive: true });
      await expect(CreateProject.run(["myApp", "en", "fr"], CLI_ROOT)).rejects.toThrow(
        /package\.json could not be imported|Invalid package\.json/
      );
    });
  });
});
