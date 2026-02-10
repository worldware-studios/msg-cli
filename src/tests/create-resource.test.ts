import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath, pathToFileURL } from "url";
import * as createResourceHelpers from "../lib/create-resource-helpers.js";
import CreateProject from "../commands/create/project.js";
import CreateResource from "../commands/create/resource.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_ROOT = join(__dirname, "..", "..");

/**
 * Writes a minimal package.json with directories and ensures i18n structure exists.
 * Creates a minimal project file that exports a MsgProject-like object for resource creation,
 * unless skipProjectFile is true (e.g. when the project will be created via create project command).
 */
function setupValidProject(
  tmp: string,
  pkgOverrides: Record<string, unknown> = {},
  projectContent?: string,
  skipProjectFile?: boolean
) {
  const pkg = {
    name: "test-app",
    version: "1.0.0",
    directories: { i18n: "i18n", l10n: "l10n", root: "." },
    ...pkgOverrides,
  };
  writeFileSync(join(tmp, "package.json"), JSON.stringify(pkg, null, 2));
  const i18nDir = join(tmp, (pkg.directories as { i18n: string }).i18n);
  const projectsDir = join(i18nDir, "projects");
  const resourcesDir = join(i18nDir, "resources");
  for (const d of [projectsDir, resourcesDir]) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  }
  const l10nTranslations = join(tmp, (pkg.directories as { l10n: string }).l10n, "translations");
  if (!existsSync(l10nTranslations)) mkdirSync(l10nTranslations, { recursive: true });

  if (!skipProjectFile) {
    const defaultProject = `module.exports = {
  project: { name: 'myProject', version: 1 },
  locales: { sourceLocale: 'en', pseudoLocale: 'en-XA', targetLocales: { en: ['en'] } },
  loader: async () => ({ title: '', attributes: { lang: '', dir: '' }, notes: [], messages: [] })
};`;
    writeFileSync(join(projectsDir, "myProject.js"), projectContent ?? defaultProject);
  }
}

describe("CreateResource command", () => {
  let tmp: string;
  let origCwd: string;

  beforeEach(() => {
    tmp = join(tmpdir(), `msg-create-resource-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    origCwd = process.cwd();
    process.chdir(tmp);
    // Symlink node_modules so generated resource files can resolve @worldware/msg
    try {
      const target = join(CLI_ROOT, "node_modules");
      if (existsSync(target)) {
        const link = join(tmp, "node_modules");
        if (!existsSync(link)) {
          symlinkSync(target, link, "dir");
        }
      }
    } catch {
      // Skip if symlink fails (e.g. sandbox)
    }
  });

  afterEach(() => {
    process.chdir(origCwd);
    rmSync(tmp, { recursive: true, force: true });
  });

  describe("Happy path", () => {
    test("creates resource file in ES module project", async () => {
      setupValidProject(tmp, { type: "module" });
      await CreateResource.run(["myProject", "messages"], CLI_ROOT);

      const ext = existsSync(join(tmp, "tsconfig.json")) ? ".ts" : ".js";
      const outPath = join(tmp, "i18n", "resources", `messages.msg${ext}`);
      expect(existsSync(outPath)).toBe(true);
      const content = readFileSync(outPath, "utf-8");
      expect(content).toContain("import { MsgResource } from '@worldware/msg'");
      expect(content).toContain("import project from '../projects/myProject.js'");
      expect(content).toContain("title: 'messages'");
      expect(content).toContain("dir: 'ltr'");
      expect(content).toContain("export default MsgResource.create");
    });

    test("creates resource file in CommonJS project", async () => {
      setupValidProject(tmp);
      await CreateResource.run(["myProject", "messages"], CLI_ROOT);

      const content = readFileSync(join(tmp, "i18n", "resources", "messages.msg.js"), "utf-8");
      expect(content).toContain("require('@worldware/msg')");
      expect(content).toContain("require('../projects/myProject')");
      expect(content).toContain("module.exports = MsgResource.create");
      expect(content).toContain("dir: 'ltr'");
    });

    test("produces TypeScript file when tsconfig present", async () => {
      setupValidProject(tmp);
      writeFileSync(join(tmp, "tsconfig.json"), JSON.stringify({ compilerOptions: {} }));
      await CreateResource.run(["myProject", "messages"], CLI_ROOT);

      expect(existsSync(join(tmp, "i18n", "resources", "messages.msg.ts"))).toBe(true);
      expect(existsSync(join(tmp, "i18n", "resources", "messages.msg.js"))).toBe(false);
    });

    test("sets dir to rtl for Arabic sourceLocale", async () => {
      setupValidProject(tmp);
      const arProject = `module.exports = {
  project: { name: 'arProject' },
  locales: { sourceLocale: 'ar', targetLocales: {} },
  loader: async () => ({ title: '', attributes: {}, notes: [], messages: [] })
};`;
      writeFileSync(join(tmp, "i18n", "projects", "arProject.js"), arProject);
      await CreateResource.run(["arProject", "messages"], CLI_ROOT);

      const content = readFileSync(join(tmp, "i18n", "resources", "messages.msg.js"), "utf-8");
      expect(content).toContain("dir: 'rtl'");
    });

    test("sets dir to rtl for Hebrew sourceLocale", async () => {
      setupValidProject(tmp);
      const heProject = `module.exports = {
  project: { name: 'heProject' },
  locales: { sourceLocale: 'he', targetLocales: {} },
  loader: async () => ({ title: '', attributes: {}, notes: [], messages: [] })
};`;
      writeFileSync(join(tmp, "i18n", "projects", "heProject.js"), heProject);
      await CreateResource.run(["heProject", "messages"], CLI_ROOT);

      const content = readFileSync(join(tmp, "i18n", "resources", "messages.msg.js"), "utf-8");
      expect(content).toContain("dir: 'rtl'");
    });

    test("sets dir to ltr for en locale", async () => {
      setupValidProject(tmp);
      await CreateResource.run(["myProject", "messages"], CLI_ROOT);

      const content = readFileSync(join(tmp, "i18n", "resources", "messages.msg.js"), "utf-8");
      expect(content).toContain("dir: 'ltr'");
    });

    test("--force overwrites existing file", async () => {
      setupValidProject(tmp);
      await CreateResource.run(["myProject", "messages"], CLI_ROOT);
      const first = readFileSync(join(tmp, "i18n", "resources", "messages.msg.js"), "utf-8");

      await CreateResource.run(["myProject", "messages", "--force"], CLI_ROOT);
      const second = readFileSync(join(tmp, "i18n", "resources", "messages.msg.js"), "utf-8");
      expect(second).toBeTruthy();
      expect(existsSync(join(tmp, "i18n", "resources", "messages.msg.js"))).toBe(true);
    });

    test("generated file is valid and importable", async () => {
      setupValidProject(tmp);
      await CreateResource.run(["myProject", "messages"], CLI_ROOT);

      const outPath = join(tmp, "i18n", "resources", "messages.msg.js");
      const mod = await import(pathToFileURL(outPath).href);
      expect(mod.default).toBeDefined();
    });

    test("generated MsgResource imports generated MsgProject in ESM without TypeScript", async () => {
      setupValidProject(tmp, { type: "module" }, undefined, true);
      // No tsconfig: ESM .js only
      await CreateProject.run(["myApp", "en", "fr"], CLI_ROOT);
      await CreateResource.run(["myApp", "messages"], CLI_ROOT);

      const outPath = join(tmp, "i18n", "resources", "messages.msg.js");
      expect(existsSync(outPath)).toBe(true);
      const mod = await import(pathToFileURL(outPath).href);
      expect(mod.default).toBeDefined();
      // Resource loaded without "MsgProject not found or could not be loaded"
      expect(mod.default.attributes?.lang).toBe("en");
      expect(mod.default.attributes?.dir).toBe("ltr");
    });
  });

  describe("Edge cases", () => {
    test("title with hyphens used as filename", async () => {
      setupValidProject(tmp);
      await CreateResource.run(["myProject", "my-messages"], CLI_ROOT);

      expect(existsSync(join(tmp, "i18n", "resources", "my-messages.msg.js"))).toBe(true);
      const content = readFileSync(join(tmp, "i18n", "resources", "my-messages.msg.js"), "utf-8");
      expect(content).toContain("title: 'my-messages'");
    });

    test("short projectName and title", async () => {
      setupValidProject(tmp);
      const pProject = `module.exports = {
  project: { name: 'p' },
  locales: { sourceLocale: 'en' },
  loader: async () => ({ title: '', attributes: {}, notes: [], messages: [] })
};`;
      writeFileSync(join(tmp, "i18n", "projects", "p.js"), pProject);
      await CreateResource.run(["p", "t"], CLI_ROOT);

      expect(existsSync(join(tmp, "i18n", "resources", "t.msg.js"))).toBe(true);
      const content = readFileSync(join(tmp, "i18n", "resources", "t.msg.js"), "utf-8");
      expect(content).toContain("title: 't'");
      expect(content).toContain("../projects/p");
    });

    test("custom i18n path", async () => {
      setupValidProject(tmp, {
        directories: { i18n: "lib/i18n", l10n: "data/l10n", root: "." },
      });
      mkdirSync(join(tmp, "lib", "i18n", "projects"), { recursive: true });
      mkdirSync(join(tmp, "lib", "i18n", "resources"), { recursive: true });
      const myProject = `module.exports = {
  project: { name: 'myProject' },
  locales: { sourceLocale: 'en' },
  loader: async () => ({ title: '', attributes: {}, notes: [], messages: [] })
};`;
      writeFileSync(join(tmp, "lib", "i18n", "projects", "myProject.js"), myProject);
      await CreateResource.run(["myProject", "messages"], CLI_ROOT);

      expect(existsSync(join(tmp, "lib", "i18n", "resources", "messages.msg.js"))).toBe(true);
    });
  });

  describe("Errors", () => {
    test("package.json not found fails", async () => {
      // tmp has no package.json - findPackageJsonPath will not find one (or finds one far up the tree)
      // Create a nested empty dir to avoid finding workspace package.json
      const emptyDir = join(tmp, "empty", "nested");
      mkdirSync(emptyDir, { recursive: true });
      process.chdir(emptyDir);
      await expect(CreateResource.run(["myProject", "messages"], CLI_ROOT)).rejects.toThrow(
        /package\.json not found|Run this command from the project root/
      );
    });

    test("missing projectName fails", async () => {
      setupValidProject(tmp);
      await expect(CreateResource.run([], CLI_ROOT)).rejects.toThrow(
        /projectName is required|Missing.*required arg/
      );
      await expect(CreateResource.run(["", "messages"], CLI_ROOT)).rejects.toThrow(
        /projectName is required/
      );
    });

    test("missing title fails", async () => {
      setupValidProject(tmp);
      await expect(CreateResource.run(["myProject"], CLI_ROOT)).rejects.toThrow(
        /title is required|Missing.*required arg/
      );
      await expect(CreateResource.run(["myProject", ""], CLI_ROOT)).rejects.toThrow(
        /title is required/
      );
    });

    test("i18n directory does not exist fails", async () => {
      writeFileSync(
        join(tmp, "package.json"),
        JSON.stringify({
          name: "app",
          directories: { i18n: "i18n", l10n: "l10n" },
        })
      );
      await expect(CreateResource.run(["myProject", "messages"], CLI_ROOT)).rejects.toThrow(
        /i18n.*does not exist|Run 'msg init'/
      );
    });

    test("i18n/projects does not exist fails", async () => {
      writeFileSync(
        join(tmp, "package.json"),
        JSON.stringify({
          name: "app",
          directories: { i18n: "i18n", l10n: "l10n" },
        })
      );
      mkdirSync(join(tmp, "i18n"), { recursive: true });
      mkdirSync(join(tmp, "l10n"), { recursive: true });
      await expect(CreateResource.run(["myProject", "messages"], CLI_ROOT)).rejects.toThrow(
        /projects.*does not exist|Run 'msg init'/
      );
    });

    test("i18n/resources does not exist fails", async () => {
      writeFileSync(
        join(tmp, "package.json"),
        JSON.stringify({
          name: "app",
          directories: { i18n: "i18n", l10n: "l10n" },
        })
      );
      mkdirSync(join(tmp, "i18n", "projects"), { recursive: true });
      mkdirSync(join(tmp, "l10n"), { recursive: true });
      await expect(CreateResource.run(["myProject", "messages"], CLI_ROOT)).rejects.toThrow(
        /resources.*does not exist|Run 'msg init'/
      );
    });

    test("projectName with no matching file fails", async () => {
      setupValidProject(tmp);
      await expect(
        CreateResource.run(["nonexistent", "messages"], CLI_ROOT)
      ).rejects.toThrow(/not found|could not be loaded/);
    });

    test("resource file exists without --force fails", async () => {
      setupValidProject(tmp);
      await CreateResource.run(["myProject", "messages"], CLI_ROOT);
      const contentBefore = readFileSync(
        join(tmp, "i18n", "resources", "messages.msg.js"),
        "utf-8"
      );

      await expect(
        CreateResource.run(["myProject", "messages"], CLI_ROOT)
      ).rejects.toThrow(/already exists|--force/);

      const contentAfter = readFileSync(
        join(tmp, "i18n", "resources", "messages.msg.js"),
        "utf-8"
      );
      expect(contentAfter).toBe(contentBefore);
    });

    test("readPackageJsonForCreateResource throws (e.g. invalid package.json)", async () => {
      setupValidProject(tmp);
      writeFileSync(join(tmp, "package.json"), "{ invalid json");
      await expect(CreateResource.run(["myProject", "messages"], CLI_ROOT)).rejects.toThrow(
        /Invalid package\.json|package\.json could not/
      );
    });

    test("writeMsgResourceFile throws", async () => {
      setupValidProject(tmp);
      vi.spyOn(createResourceHelpers, "writeMsgResourceFile").mockImplementation(() => {
        throw new Error("Permission denied");
      });
      await expect(CreateResource.run(["myProject", "messages"], CLI_ROOT)).rejects.toThrow(
        /Could not generate resource file|Permission denied/
      );
      vi.restoreAllMocks();
    });

    test("generated file fails validation and is cleaned up", async () => {
      setupValidProject(tmp);
      vi.spyOn(createResourceHelpers, "writeMsgResourceFile").mockImplementation(
        (filePath: string) => {
          writeFileSync(filePath, "invalid syntax {{{", "utf-8");
        }
      );
      const outPath = join(tmp, "i18n", "resources", "messages.msg.js");
      await expect(CreateResource.run(["myProject", "messages"], CLI_ROOT)).rejects.toThrow(
        /invalid or not importable|invalid|SyntaxError/
      );
      expect(existsSync(outPath)).toBe(false);
      vi.restoreAllMocks();
    });
  });

  describe("--edit flag", () => {
    test("--edit with no EDITOR or VISUAL warns and does not throw", async () => {
      const origEditor = process.env.EDITOR;
      const origVisual = process.env.VISUAL;
      delete process.env.EDITOR;
      delete process.env.VISUAL;
      try {
        setupValidProject(tmp);
        const warnSpy = vi.spyOn(CreateResource.prototype, "warn");
        await CreateResource.run(["myProject", "messages", "--edit"], CLI_ROOT);
        expect(warnSpy).toHaveBeenCalledWith(
          "EDITOR or VISUAL not set. Open the file manually."
        );
      } finally {
        if (origEditor !== undefined) process.env.EDITOR = origEditor;
        if (origVisual !== undefined) process.env.VISUAL = origVisual;
      }
    });
  });
});
