import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { pathToFileURL } from "url";
import {
  dynamicImportFromUrl,
  readPackageJsonForCreateResource,
  importMsgProjectForResource,
  generateMsgResourceContent,
  writeMsgResourceFile,
} from "../lib/create-resource-helpers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("create-resource-helpers", () => {
  describe("readPackageJsonForCreateResource", () => {
    let tmp: string;

    beforeEach(() => {
      tmp = join(tmpdir(), `msg-cr-helpers-${Date.now()}`);
      mkdirSync(tmp, { recursive: true });
    });

    afterEach(() => {
      rmSync(tmp, { recursive: true, force: true });
    });

    test("returns i18nDir, isEsm, useTypeScript when valid package.json", () => {
      writeFileSync(
        join(tmp, "package.json"),
        JSON.stringify({
          name: "app",
          type: "module",
          directories: { i18n: "src/i18n", l10n: "res/l10n" },
        })
      );
      writeFileSync(join(tmp, "tsconfig.json"), "{}");
      const result = readPackageJsonForCreateResource(tmp);
      expect(result.i18nDir).toBe("src/i18n");
      expect(result.isEsm).toBe(true);
      expect(result.useTypeScript).toBe(true);
    });

    test("returns useTypeScript false when no tsconfig.json", () => {
      writeFileSync(
        join(tmp, "package.json"),
        JSON.stringify({
          name: "app",
          directories: { i18n: "i18n", l10n: "l10n" },
        })
      );
      const result = readPackageJsonForCreateResource(tmp);
      expect(result.useTypeScript).toBe(false);
      expect(result.isEsm).toBe(false);
    });

    test("returns isEsm true when type is module", () => {
      writeFileSync(
        join(tmp, "package.json"),
        JSON.stringify({
          name: "app",
          type: "module",
          directories: { i18n: "i18n", l10n: "l10n" },
        })
      );
      const result = readPackageJsonForCreateResource(tmp);
      expect(result.isEsm).toBe(true);
    });

    test("throws when package.json not found", () => {
      expect(() => readPackageJsonForCreateResource(tmp)).toThrow(
        /package\.json not found|directories\.i18n|Run 'msg init'|init/
      );
    });

    test("throws when directories.i18n missing", () => {
      writeFileSync(join(tmp, "package.json"), JSON.stringify({ name: "app" }));
      expect(() => readPackageJsonForCreateResource(tmp)).toThrow(
        /directories\.i18n|Run 'msg init'|init/
      );
    });

    test("throws when package.json is invalid JSON", () => {
      writeFileSync(join(tmp, "package.json"), "{ invalid json");
      expect(() => readPackageJsonForCreateResource(tmp)).toThrow(
        /Invalid package\.json|package\.json could not/
      );
    });
  });

  describe("importMsgProjectForResource", () => {
    let tmp: string;

    beforeEach(() => {
      tmp = join(tmpdir(), `msg-cr-import-${Date.now()}`);
      mkdirSync(tmp, { recursive: true });
    });

    afterEach(() => {
      rmSync(tmp, { recursive: true, force: true });
    });

    test("returns undefined when project file does not exist", async () => {
      const result = await importMsgProjectForResource(tmp, "nonexistent");
      expect(result).toBeUndefined();
    });

    test("returns sourceLocale and dir ltr for en locale", async () => {
      writeFileSync(
        join(tmp, "myProject.js"),
        "module.exports = { locales: { sourceLocale: 'en' } };"
      );
      const result = await importMsgProjectForResource(tmp, "myProject");
      expect(result).toEqual({ sourceLocale: "en", dir: "ltr" });
    });

    test("returns dir rtl for ar sourceLocale", async () => {
      writeFileSync(
        join(tmp, "myProject.js"),
        "module.exports = { locales: { sourceLocale: 'ar' } };"
      );
      const result = await importMsgProjectForResource(tmp, "myProject");
      expect(result).toEqual({ sourceLocale: "ar", dir: "rtl" });
    });

    test("returns dir rtl for ar-SA sourceLocale", async () => {
      writeFileSync(
        join(tmp, "myProject.js"),
        "module.exports = { locales: { sourceLocale: 'ar-SA' } };"
      );
      const result = await importMsgProjectForResource(tmp, "myProject");
      expect(result).toEqual({ sourceLocale: "ar-SA", dir: "rtl" });
    });

    test("returns dir rtl for he sourceLocale", async () => {
      writeFileSync(
        join(tmp, "myProject.js"),
        "module.exports = { locales: { sourceLocale: 'he' } };"
      );
      const result = await importMsgProjectForResource(tmp, "myProject");
      expect(result).toEqual({ sourceLocale: "he", dir: "rtl" });
    });

    test("returns dir rtl for he-IL sourceLocale", async () => {
      writeFileSync(
        join(tmp, "myProject.js"),
        "module.exports = { locales: { sourceLocale: 'he-IL' } };"
      );
      const result = await importMsgProjectForResource(tmp, "myProject");
      expect(result).toEqual({ sourceLocale: "he-IL", dir: "rtl" });
    });

    test("throws when project file throws on import", async () => {
      writeFileSync(join(tmp, "broken.js"), "throw new Error('bad');");
      await expect(
        importMsgProjectForResource(tmp, "broken")
      ).rejects.toThrow(/could not be loaded|bad/);
    });

    test("throws when project has no sourceLocale", async () => {
      writeFileSync(
        join(tmp, "noLocale.js"),
        "module.exports = { locales: {} };"
      );
      await expect(
        importMsgProjectForResource(tmp, "noLocale")
      ).rejects.toThrow(/sourceLocale|could not be loaded/);
    });

    test("throws when sourceLocale is not a string (e.g. number)", async () => {
      writeFileSync(
        join(tmp, "badLocale.js"),
        "module.exports = { locales: { sourceLocale: 42 } };"
      );
      await expect(
        importMsgProjectForResource(tmp, "badLocale")
      ).rejects.toThrow(/sourceLocale|must export.*locales\.sourceLocale|got number/);
    });
  });

  describe("generateMsgResourceContent", () => {
    test("generates ESM content with correct structure", () => {
      const content = generateMsgResourceContent({
        title: "messages",
        projectName: "myProject",
        sourceLocale: "en",
        dir: "ltr",
        isEsm: true,
      });
      expect(content).toContain("import { MsgResource } from '@worldware/msg'");
      expect(content).toContain("import project from '../projects/myProject.js'");
      expect(content).toContain("title: 'messages'");
      expect(content).toContain("lang: 'en'");
      expect(content).toContain("dir: 'ltr'");
      expect(content).toContain("export default MsgResource.create");
      expect(content).not.toContain("module.exports");
      expect(content).toContain("example.message");
      expect(content).toContain("Example message.");
    });

    test("generates CJS content with module.exports", () => {
      const content = generateMsgResourceContent({
        title: "messages",
        projectName: "myProject",
        sourceLocale: "en",
        dir: "ltr",
        isEsm: false,
      });
      expect(content).toContain("require('@worldware/msg')");
      expect(content).toContain("require('../projects/myProject')");
      expect(content).toContain("module.exports = MsgResource.create");
      expect(content).not.toContain("export default");
      expect(content).toContain("dir: 'ltr'");
    });

    test("generates rtl dir when dir is rtl", () => {
      const content = generateMsgResourceContent({
        title: "messages",
        projectName: "myProject",
        sourceLocale: "ar",
        dir: "rtl",
        isEsm: true,
      });
      expect(content).toContain("dir: 'rtl'");
    });

    test("handles title with hyphens", () => {
      const content = generateMsgResourceContent({
        title: "my-messages",
        projectName: "app",
        sourceLocale: "en",
        dir: "ltr",
        isEsm: true,
      });
      expect(content).toContain("title: 'my-messages'");
    });

    test("handles short projectName and title", () => {
      const content = generateMsgResourceContent({
        title: "t",
        projectName: "p",
        sourceLocale: "en",
        dir: "ltr",
        isEsm: true,
      });
      expect(content).toContain("title: 't'");
      expect(content).toContain("../projects/p.js");
    });
  });

  describe("writeMsgResourceFile", () => {
    let tmp: string;

    beforeEach(() => {
      tmp = join(tmpdir(), `msg-cr-write-${Date.now()}`);
      mkdirSync(tmp, { recursive: true });
    });

    afterEach(() => {
      rmSync(tmp, { recursive: true, force: true });
    });

    test("writes content to file and creates parent dirs", () => {
      const filePath = join(tmp, "resources", "messages.msg.js");
      const content = "// test content";
      writeMsgResourceFile(filePath, content);
      expect(existsSync(filePath)).toBe(true);
      expect(readFileSync(filePath, "utf-8")).toBe(content);
    });

    test("overwrites existing file with new content", () => {
      const filePath = join(tmp, "existing.msg.js");
      writeFileSync(filePath, "old content", "utf-8");
      writeMsgResourceFile(filePath, "new content");
      expect(readFileSync(filePath, "utf-8")).toBe("new content");
    });
  });

  describe("dynamicImportFromUrl", () => {
    let tmp: string;

    beforeEach(() => {
      tmp = join(tmpdir(), `msg-cr-dynamic-${Date.now()}`);
      mkdirSync(tmp, { recursive: true });
    });

    afterEach(() => {
      rmSync(tmp, { recursive: true, force: true });
    });

    test("imports CJS file and returns module", async () => {
      const cjsPath = join(tmp, "mod.js");
      writeFileSync(
        cjsPath,
        "module.exports = { foo: 1, bar: 2 };",
        "utf-8"
      );
      const url = pathToFileURL(cjsPath).href;
      const mod = await dynamicImportFromUrl(url);
      expect(mod).toBeDefined();
      expect(mod.foo).toBe(1);
      expect(mod.bar).toBe(2);
    });

    test("throws when file fails to load", async () => {
      const badPath = join(tmp, "syntax-error.js");
      writeFileSync(badPath, "{{{ invalid", "utf-8");
      const url = pathToFileURL(badPath).href;
      await expect(dynamicImportFromUrl(url)).rejects.toThrow();
    });
  });
});
