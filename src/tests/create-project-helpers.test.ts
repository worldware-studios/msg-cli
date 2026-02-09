import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import {
  calculateRelativePath,
  loadPackageJsonForCreateProject,
  writeMsgProjectFile,
  importMsgProjectFile,
} from "../lib/create-project-helpers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("create-project-helpers", () => {
  describe("calculateRelativePath", () => {
    test("returns relative path from projects to translations (sibling dirs)", () => {
      const projects = "/root/i18n/projects";
      const translations = "/root/l10n/translations";
      expect(calculateRelativePath(projects, translations)).toBe("../../l10n/translations");
    });

    test("returns relative path for custom i18n/l10n", () => {
      const projects = "/root/lib/i18n/projects";
      const translations = "/root/data/l10n/translations";
      expect(calculateRelativePath(projects, translations)).toBe("../../../data/l10n/translations");
    });

    test("prefixes with ./ when result does not start with .", () => {
      const projects = "/root/i18n/projects";
      const translations = "/root/i18n/projects/translations";
      const rel = calculateRelativePath(projects, translations);
      expect(rel).toMatch(/^\./);
    });
  });

  describe("loadPackageJsonForCreateProject", () => {
    let tmp: string;

    beforeEach(() => {
      tmp = join(tmpdir(), `msg-cp-helpers-${Date.now()}`);
      mkdirSync(tmp, { recursive: true });
    });

    afterEach(() => {
      rmSync(tmp, { recursive: true, force: true });
    });

    test("returns pkg with directories when valid", () => {
      writeFileSync(
        join(tmp, "package.json"),
        JSON.stringify({
          name: "app",
          directories: { i18n: "i18n", l10n: "l10n" },
        })
      );
      const pkg = loadPackageJsonForCreateProject(tmp);
      expect(pkg.directories.i18n).toBe("i18n");
      expect(pkg.directories.l10n).toBe("l10n");
    });

    test("throws when package.json not found", () => {
      expect(() => loadPackageJsonForCreateProject(tmp)).toThrow(
        /package\.json not found|Run this command from the project root/
      );
    });

    test("throws when package.json is invalid JSON", () => {
      writeFileSync(join(tmp, "package.json"), "{ invalid");
      expect(() => loadPackageJsonForCreateProject(tmp)).toThrow(
        /package\.json could not be imported|Invalid package\.json/
      );
    });

    test("throws when directories.i18n or directories.l10n missing", () => {
      writeFileSync(join(tmp, "package.json"), JSON.stringify({ name: "app" }));
      expect(() => loadPackageJsonForCreateProject(tmp)).toThrow(
        /directories\.i18n and directories\.l10n|Run 'msg init' first/
      );
    });
  });

  describe("writeMsgProjectFile", () => {
    let tmp: string;

    beforeEach(() => {
      tmp = join(tmpdir(), `msg-cp-write-${Date.now()}`);
      mkdirSync(tmp, { recursive: true });
    });

    afterEach(() => {
      rmSync(tmp, { recursive: true, force: true });
    });

    test("writes content to file and creates parent dirs", () => {
      const filePath = join(tmp, "sub", "dir", "project.js");
      writeMsgProjectFile(filePath, "content");
      expect(existsSync(filePath)).toBe(true);
      expect(readFileSync(filePath, "utf-8")).toBe("content");
    });
  });

  describe("importMsgProjectFile", () => {
    let tmp: string;

    beforeEach(() => {
      tmp = join(tmpdir(), `msg-cp-import-${Date.now()}`);
      mkdirSync(tmp, { recursive: true });
    });

    afterEach(() => {
      rmSync(tmp, { recursive: true, force: true });
    });

    test("returns undefined when file does not exist", async () => {
      const result = await importMsgProjectFile(tmp, "nonexistent");
      expect(result).toBeUndefined();
    });

    test("returns default export when .js file exists", async () => {
      writeFileSync(
        join(tmp, "base.js"),
        "module.exports = { project: { name: 'base' }, locales: {}, loader: () => {} };"
      );
      const result = await importMsgProjectFile(tmp, "base");
      expect(result).toBeDefined();
      expect(result?.project?.name).toBe("base");
    });
  });
});
