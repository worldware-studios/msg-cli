import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { pathToFileURL } from "url";
import { MsgProject, MsgResource } from "@worldware/msg";
import {
  findMsgResourceFilePaths,
  importMsgResourcesFromPaths,
  groupResourcesByProject,
  filterResourceGroupsByProject,
  serializeResourceGroupsToXliff,
  writeXliffFiles,
  type ResourceGroup,
} from "../lib/export-helpers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_MSG = join(__dirname, "fixtures", "msg-files");
const FIXTURES_MSG_INVALID = join(__dirname, "fixtures", "msg-files-invalid");

/** Creates a minimal MsgProject for use in tests. */
function createTestProject(name: string) {
  return MsgProject.create({
    project: { name },
    locales: {
      sourceLocale: "en",
      pseudoLocale: "en-XA",
      targetLocales: { en: ["en"] },
    },
    loader: async () => ({
      title: "",
      attributes: { lang: "", dir: "", dnt: false },
      messages: [],
    }),
  });
}

/** Creates a minimal MsgResource for use in tests. */
function createTestResource(
  title: string,
  projectName: string,
  messages: { key: string; value: string }[] = []
) {
  const project = createTestProject(projectName);
  return MsgResource.create(
    {
      title,
      attributes: { lang: "en", dir: "ltr" },
      messages,
    },
    project
  );
}

describe("export-helpers", () => {
  describe("findMsgResourceFilePaths", () => {
    let tmp: string;

    beforeEach(() => {
      tmp = join(tmpdir(), `msg-export-find-${Date.now()}`);
      mkdirSync(tmp, { recursive: true });
    });

    afterEach(() => {
      rmSync(tmp, { recursive: true, force: true });
    });

    test("returns empty array when directory is empty", async () => {
      const result = await findMsgResourceFilePaths(tmp);
      expect(result).toEqual([]);
    });

    test("returns paths for .msg.js and .msg.ts files in root", async () => {
      writeFileSync(join(tmp, "a.msg.js"), "");
      writeFileSync(join(tmp, "b.msg.ts"), "");
      const result = await findMsgResourceFilePaths(tmp);
      expect(result).toHaveLength(2);
      expect(result.map((p) => p.replace(tmp, ""))).toContain("/a.msg.js");
      expect(result.map((p) => p.replace(tmp, ""))).toContain("/b.msg.ts");
    });

    test("ignores plain .js and .ts files", async () => {
      writeFileSync(join(tmp, "plain.js"), "");
      writeFileSync(join(tmp, "plain.ts"), "");
      const result = await findMsgResourceFilePaths(tmp);
      expect(result).toHaveLength(0);
    });

    test("recursively finds files in nested directories", async () => {
      mkdirSync(join(tmp, "sub"), { recursive: true });
      mkdirSync(join(tmp, "sub", "deep"), { recursive: true });
      writeFileSync(join(tmp, "root.msg.js"), "");
      writeFileSync(join(tmp, "sub", "nested.msg.ts"), "");
      writeFileSync(join(tmp, "sub", "deep", "deep.msg.js"), "");
      const result = await findMsgResourceFilePaths(tmp);
      expect(result).toHaveLength(3);
      expect(result.some((p) => p.endsWith("root.msg.js"))).toBe(true);
      expect(result.some((p) => p.endsWith("nested.msg.ts"))).toBe(true);
      expect(result.some((p) => p.endsWith("deep.msg.js"))).toBe(true);
    });

    test("with fixtures dir returns all .msg. file paths", async () => {
      const result = await findMsgResourceFilePaths(FIXTURES_MSG);
      expect(result.length).toBeGreaterThanOrEqual(3);
      expect(result.some((p) => p.endsWith("Example.msg.ts"))).toBe(true);
      expect(result.some((p) => p.endsWith("Other.msg.js"))).toBe(true);
      expect(result.some((p) => p.endsWith("Nested.msg.ts"))).toBe(true);
      expect(result.some((p) => p.endsWith("Deep.msg.js"))).toBe(true);
    });

    test("rejects when directory does not exist", async () => {
      const badDir = join(tmp, "nonexistent");
      await expect(findMsgResourceFilePaths(badDir)).rejects.toThrow();
    });
  });

  describe("importMsgResourcesFromPaths", () => {
    test("returns array of MsgResource when given valid fixture paths", async () => {
      const paths = await findMsgResourceFilePaths(FIXTURES_MSG);
      const firstPath = paths.find((p) => p.endsWith("Example.msg.ts")) ?? paths[0];
      const result = await importMsgResourcesFromPaths([firstPath]);
      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(MsgResource);
      expect(result[0].title).toBe("Example");
      expect(result[0].getProject().project.name).toBe("test");
    });

    test("throws when file does not export valid MsgResource", async () => {
      const invalidPath = join(FIXTURES_MSG_INVALID, "Invalid.msg.ts");
      await expect(
        importMsgResourcesFromPaths([invalidPath])
      ).rejects.toThrow(/MsgResource|no valid export|Failed to import/);
    });

    test("returns multiple resources when given multiple paths", async () => {
      const paths = await findMsgResourceFilePaths(FIXTURES_MSG);
      const twoPaths = paths.slice(0, 2);
      const result = await importMsgResourcesFromPaths(twoPaths);
      expect(result).toHaveLength(2);
    });
  });

  describe("groupResourcesByProject", () => {
    test("returns empty array when resources is empty", () => {
      const result = groupResourcesByProject([]);
      expect(result).toEqual([]);
    });

    test("groups single resource by project name", () => {
      const res = createTestResource("R1", "myProject", [
        { key: "k1", value: "v1" },
      ]);
      const result = groupResourcesByProject([res]);
      expect(result).toHaveLength(1);
      expect(result[0].project).toBe("myProject");
      expect(result[0].resources).toHaveLength(1);
      expect(result[0].resources[0].title).toBe("R1");
    });

    test("groups multiple resources from same project", () => {
      const r1 = createTestResource("A", "proj");
      const r2 = createTestResource("B", "proj");
      const result = groupResourcesByProject([r1, r2]);
      expect(result).toHaveLength(1);
      expect(result[0].project).toBe("proj");
      expect(result[0].resources).toHaveLength(2);
    });

    test("splits resources from different projects", () => {
      const r1 = createTestResource("A", "projectA");
      const r2 = createTestResource("B", "projectB");
      const r3 = createTestResource("C", "projectA");
      const result = groupResourcesByProject([r1, r2, r3]);
      expect(result).toHaveLength(2);
      const groupA = result.find((g) => g.project === "projectA");
      const groupB = result.find((g) => g.project === "projectB");
      expect(groupA?.resources).toHaveLength(2);
      expect(groupB?.resources).toHaveLength(1);
    });
  });

  describe("filterResourceGroupsByProject", () => {
    test("returns empty when no group matches", () => {
      const groups: ResourceGroup[] = [
        { project: "A", resources: [createTestResource("R", "A")] },
      ];
      const result = filterResourceGroupsByProject(groups, "B");
      expect(result).toEqual([]);
    });

    test("returns only the matching project group", () => {
      const rA = createTestResource("R1", "projectA");
      const rB = createTestResource("R2", "projectB");
      const groups: ResourceGroup[] = [
        { project: "projectA", resources: [rA] },
        { project: "projectB", resources: [rB] },
      ];
      const result = filterResourceGroupsByProject(groups, "projectA");
      expect(result).toHaveLength(1);
      expect(result[0].project).toBe("projectA");
      expect(result[0].resources).toHaveLength(1);
    });

    test("leaves other groups unchanged when not filtering", () => {
      const groups: ResourceGroup[] = [
        { project: "X", resources: [createTestResource("R", "X")] },
      ];
      const result = filterResourceGroupsByProject(groups, "X");
      expect(result).toHaveLength(1);
      expect(result[0].project).toBe("X");
    });
  });

  describe("serializeResourceGroupsToXliff", () => {
    test("returns empty array when groups is empty", () => {
      const result = serializeResourceGroupsToXliff([]);
      expect(result).toEqual([]);
    });

    test("produces valid XLIFF 2.0 with xmlns 2.0", () => {
      const res = createTestResource("TestRes", "myProj", [
        { key: "hello", value: "Hello" },
      ]);
      const groups: ResourceGroup[] = [
        { project: "myProj", resources: [res] },
      ];
      const result = serializeResourceGroupsToXliff(groups);
      expect(result).toHaveLength(1);
      expect(result[0].project).toBe("myProj");
      const xliff = result[0].xliff;
      expect(xliff).toContain('xmlns="urn:oasis:names:tc:xliff:document:2.0"');
      expect(xliff).toContain('version="2.0"');
      expect(xliff).toContain("<source>Hello</source>");
      expect(xliff).toContain("<unit ");
      expect(xliff).toContain("<segment>");
    });

    test("includes message key and value in unit/segment", () => {
      const res = createTestResource("R", "P", [
        { key: "msg.key", value: "Message text" },
      ]);
      const result = serializeResourceGroupsToXliff([
        { project: "P", resources: [res] },
      ]);
      expect(result[0].xliff).toContain("Message text");
      expect(result[0].xliff).toMatch(/id="[^"]*"/);
    });

    test("merges multiple resources in one group into one XLIFF file", () => {
      const r1 = createTestResource("R1", "same", [
        { key: "a", value: "A" },
      ]);
      const r2 = createTestResource("R2", "same", [
        { key: "b", value: "B" },
      ]);
      const result = serializeResourceGroupsToXliff([
        { project: "same", resources: [r1, r2] },
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].xliff).toContain("<source>A</source>");
      expect(result[0].xliff).toContain("<source>B</source>");
    });

    test("produces one xliff string per group", () => {
      const g1 = {
        project: "P1",
        resources: [createTestResource("R1", "P1")],
      };
      const g2 = {
        project: "P2",
        resources: [createTestResource("R2", "P2")],
      };
      const result = serializeResourceGroupsToXliff([g1, g2]);
      expect(result).toHaveLength(2);
      expect(result[0].project).toBe("P1");
      expect(result[1].project).toBe("P2");
    });
  });

  describe("writeXliffFiles", () => {
    let tmp: string;

    beforeEach(() => {
      tmp = join(tmpdir(), `msg-export-write-${Date.now()}`);
      mkdirSync(tmp, { recursive: true });
    });

    afterEach(() => {
      rmSync(tmp, { recursive: true, force: true });
    });

    test("creates directory if it does not exist", async () => {
      const xliffDir = join(tmp, "l10n", "xliff");
      const groups = [
        { project: "myProject", xliff: '<?xml version="1.0"?><xliff version="2.0"></xliff>' },
      ];
      await writeXliffFiles(xliffDir, groups);
      expect(existsSync(xliffDir)).toBe(true);
    });

    test("writes one file per group with project name as filename", async () => {
      const xliffDir = join(tmp, "xliff");
      mkdirSync(xliffDir, { recursive: true });
      const content = '<?xml version="1.0"?><xliff version="2.0" xmlns="urn:oasis:names:tc:xliff:document:2.0">ok</xliff>';
      await writeXliffFiles(xliffDir, [
        { project: "myApp", xliff: content },
      ]);
      const filePath = join(xliffDir, "myApp.xliff");
      expect(existsSync(filePath)).toBe(true);
      expect(readFileSync(filePath, "utf-8")).toBe(content);
    });

    test("writes multiple files for multiple groups", async () => {
      const xliffDir = join(tmp, "xliff");
      mkdirSync(xliffDir, { recursive: true });
      await writeXliffFiles(xliffDir, [
        { project: "projA", xliff: "<xliff>A</xliff>" },
        { project: "projB", xliff: "<xliff>B</xliff>" },
      ]);
      expect(readFileSync(join(xliffDir, "projA.xliff"), "utf-8")).toBe(
        "<xliff>A</xliff>"
      );
      expect(readFileSync(join(xliffDir, "projB.xliff"), "utf-8")).toBe(
        "<xliff>B</xliff>"
      );
    });
  });
});
