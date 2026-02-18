import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { MsgProject, MsgResource } from "@worldware/msg";
import {
  findXliffFilePaths,
  filterXliffPathsByProject,
  filterXliffPathsByLocale,
  parseXliffFilename,
  parseXliff20,
  extractResourceFromXliffFile,
  processXliffFile,
  writeTranslationFiles,
  importMsgProject,
  type ImportResult,
} from "../lib/import-helpers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_XLIFF = join(__dirname, "fixtures", "xliff");
const FIXTURES_PROJECTS = join(__dirname, "fixtures", "projects");

function createTestProject(targetLocales: Record<string, string[]> = { en: ["en"], zh: ["zh"] }) {
  return MsgProject.create({
    project: { name: "test" },
    locales: {
      sourceLocale: "en",
      pseudoLocale: "en-XA",
      targetLocales,
    },
    loader: async () => ({
      title: "",
      attributes: { lang: "", dir: "", dnt: false },
      messages: [],
    }),
  });
}

describe("import-helpers", () => {
  describe("findXliffFilePaths", () => {
    let tmp: string;

    beforeEach(() => {
      tmp = join(tmpdir(), `msg-import-find-${Date.now()}`);
      mkdirSync(tmp, { recursive: true });
    });

    afterEach(() => {
      rmSync(tmp, { recursive: true, force: true });
    });

    test("returns empty array when directory is empty", async () => {
      const result = await findXliffFilePaths(tmp);
      expect(result).toEqual([]);
    });

    test("returns paths for .xliff and .xlf files", async () => {
      writeFileSync(join(tmp, "a.xliff"), "");
      writeFileSync(join(tmp, "b.xlf"), "");
      const result = await findXliffFilePaths(tmp);
      expect(result).toHaveLength(2);
      expect(result.some((p) => p.endsWith("a.xliff"))).toBe(true);
      expect(result.some((p) => p.endsWith("b.xlf"))).toBe(true);
    });

    test("ignores non-xliff files", async () => {
      writeFileSync(join(tmp, "plain.xml"), "");
      writeFileSync(join(tmp, "doc.json"), "");
      const result = await findXliffFilePaths(tmp);
      expect(result).toHaveLength(0);
    });

    test("recursively finds files in nested directories", async () => {
      mkdirSync(join(tmp, "sub"), { recursive: true });
      writeFileSync(join(tmp, "root.xliff"), "");
      writeFileSync(join(tmp, "sub", "nested.xliff"), "");
      const result = await findXliffFilePaths(tmp);
      expect(result).toHaveLength(2);
    });

    test("with fixtures dir returns xliff paths", async () => {
      const result = await findXliffFilePaths(FIXTURES_XLIFF);
      expect(result.some((p) => p.endsWith("test.zh.xliff"))).toBe(true);
    });

    test("rejects when directory does not exist", async () => {
      await expect(findXliffFilePaths(join(tmp, "nonexistent"))).rejects.toThrow();
    });
  });

  describe("filterXliffPathsByProject", () => {
    test("returns empty when no paths match", () => {
      const paths = ["/a/b/myapp.fr.xliff", "/a/b/other.de.xliff"];
      const result = filterXliffPathsByProject(paths, "proj");
      expect(result).toEqual([]);
    });

    test("filters by filename prefix only (no path match)", () => {
      const paths = ["/a/b/myapp.fr.xliff"];
      const result = filterXliffPathsByProject(paths, "myapp");
      expect(result).toHaveLength(1);
    });

    test("filters by filename prefix", () => {
      const paths = [
        "/a/b/myapp.fr.xliff",
        "/a/b/myapp.de.xliff",
        "/a/b/other.de.xliff",
      ];
      const result = filterXliffPathsByProject(paths, "myapp");
      expect(result).toHaveLength(2);
    });

    test("filters by project as directory in path", () => {
      const paths = ["/xliff/myapp/fr/file.xliff", "/xliff/other/de/file.xliff"];
      const result = filterXliffPathsByProject(paths, "myapp");
      expect(result).toHaveLength(1);
      expect(result[0]).toContain("myapp");
    });
  });

  describe("filterXliffPathsByLocale", () => {
    test("returns empty when no paths match", () => {
      const paths = ["/a/b/test.zh.xliff"];
      const result = filterXliffPathsByLocale(paths, "fr");
      expect(result).toEqual([]);
    });

    test("filters by locale in filename", () => {
      const paths = [
        "/a/b/test.zh.xliff",
        "/a/b/test.fr.xliff",
        "/a/b/test.de.xliff",
      ];
      const result = filterXliffPathsByLocale(paths, "fr");
      expect(result).toHaveLength(1);
      expect(result[0]).toContain(".fr.");
    });

    test("filters by locale as directory in path", () => {
      const paths = ["/xliff/test/zh/file.xliff", "/xliff/test/fr/file.xliff"];
      const result = filterXliffPathsByLocale(paths, "zh");
      expect(result).toHaveLength(1);
      expect(result[0]).toContain("zh");
    });
  });

  describe("parseXliffFilename", () => {
    test("extracts project and locale from project.locale.xliff", () => {
      const result = parseXliffFilename("/a/b/test.zh.xliff");
      expect(result.project).toBe("test");
      expect(result.locale).toBe("zh");
    });

    test("extracts project only from project.xliff", () => {
      const result = parseXliffFilename("/a/b/test.xliff");
      expect(result.project).toBe("test");
      expect(result.locale).toBeUndefined();
    });

    test("handles .xlf extension", () => {
      const result = parseXliffFilename("/a/b/app.fr.xlf");
      expect(result.project).toBe("app");
      expect(result.locale).toBe("fr");
    });

    test("extracts locale from path when not in filename", () => {
      const result = parseXliffFilename("/xliff/myapp/zh/file.xliff");
      expect(result.locale).toBe("zh");
    });

    test("handles filename that does not match pattern", () => {
      const result = parseXliffFilename("/a/b/file.xliff");
      expect(result.project).toBe("file");
      expect(result.locale).toBeUndefined();
    });

    test("extracts project from path when match gives empty project", () => {
      const result = parseXliffFilename("/some/path/x.xliff");
      expect(result.project).toBeDefined();
    });

    test("fallback extracts project from path when project empty (e.g. .xliff)", () => {
      const result = parseXliffFilename("/a/b/c/.xliff");
      expect(result.project).toBeTruthy();
      expect(result.project).not.toBe("");
    });
  });

  describe("parseXliff20", () => {
    test("parses valid XLIFF 2.0", () => {
      const xml = '<?xml version="1.0"?><xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" version="2.0" srcLang="en" trgLang="zh"></xliff>';
      const result = parseXliff20(xml);
      expect(result).toBeDefined();
      const xliff = (result as Record<string, unknown>).xliff as Record<string, unknown>;
      expect(xliff["@_trgLang"]).toBe("zh");
    });

    test("throws on malformed XML", () => {
      expect(() => parseXliff20(readFileSync(join(FIXTURES_XLIFF, "invalid.xliff"), "utf-8"))).toThrow(/Malformed|parse/);
    });

    test("throws on invalid XLIFF content", () => {
      expect(() => parseXliff20("This is not valid XML <<<")).toThrow(/Malformed|parse/);
    });
  });

  describe("extractResourceFromXliffFile", () => {
    const project = createTestProject();

    test("returns null for monolingual (no trgLang)", () => {
      const fileEl = {
        "@_original": "Example.json",
        "@_id": "f1",
        unit: {
          "@_id": "u1",
          "@_name": "hello",
          segment: {
            source: "Hello",
            target: "Hi",
          },
        },
      };
      const result = extractResourceFromXliffFile(
        fileEl as unknown as Record<string, unknown>,
        undefined, // no xliff trgLang
        project,
        ["zh"]
      );
      expect(result).toBeNull();
    });

    test("returns null when trgLang not in targetLocales", () => {
      const fileEl = {
        "@_original": "Example.json",
        "@_trgLang": "ja",
        unit: {
          "@_id": "u1",
          "@_name": "hello",
          segment: { source: "Hello", target: "こんにちは" },
        },
      };
      const result = extractResourceFromXliffFile(
        fileEl as unknown as Record<string, unknown>,
        "ja",
        project,
        ["en", "zh"]
      );
      expect(result).toBeNull();
    });

    test("extracts MsgResource with messages", () => {
      const fileEl = {
        "@_original": "Example.json",
        "@_trgLang": "zh",
        unit: [
          {
            "@_id": "u1",
            "@_name": "hello",
            segment: { source: "Hello", target: "你好" },
          },
          {
            "@_id": "u2",
            "@_name": "world",
            segment: { source: "World", target: "世界" },
          },
        ],
      };
      const result = extractResourceFromXliffFile(
        fileEl as unknown as Record<string, unknown>,
        "zh",
        project,
        ["zh"]
      );
      expect(result).toBeInstanceOf(MsgResource);
      expect(result!.title).toBe("Example");
      expect(result!.attributes.lang).toBe("zh");
      const data = result!.getData(true);
      expect(data.messages).toHaveLength(2);
      expect(data.messages![0]).toEqual({
        key: "hello",
        value: "你好",
        attributes: expect.any(Object),
      });
      expect(data.messages![1].value).toBe("世界");
    });

    test("extracts notes from units", () => {
      const fileEl = {
        "@_original": "R.json",
        "@_trgLang": "zh",
        unit: {
          "@_id": "u1",
          "@_name": "k1",
          notes: {
            note: { "@_category": "description", "#text": "A note" },
          },
          segment: { source: "S", target: "T" },
        },
      };
      const result = extractResourceFromXliffFile(
        fileEl as unknown as Record<string, unknown>,
        "zh",
        project,
        ["zh"]
      );
      expect(result).toBeInstanceOf(MsgResource);
      const data = result!.getData(false);
      expect(data.messages![0].notes).toBeDefined();
      expect(data.messages![0].notes![0].type).toBe("DESCRIPTION");
      expect(data.messages![0].notes![0].content).toBe("A note");
    });

    test("extracts file-level notes and attributes (trgDir, translate=no)", () => {
      const fileEl = {
        "@_original": "R.json",
        "@_trgLang": "zh",
        "@_trgDir": "rtl",
        "@_translate": "no",
        notes: {
          note: [{ "@_category": "comment", "#text": "File note" }],
        },
        unit: {
          "@_id": "u1",
          "@_name": "k1",
          segment: { source: "S", target: "T" },
        },
      };
      const result = extractResourceFromXliffFile(
        fileEl as unknown as Record<string, unknown>,
        "zh",
        project,
        ["zh"]
      );
      expect(result).toBeInstanceOf(MsgResource);
      expect(result!.attributes.dir).toBe("rtl");
      expect(result!.attributes.dnt).toBe(true);
      const data = result!.getData(false);
      expect(data.notes).toBeDefined();
      expect(data.notes![0].type).toBe("COMMENT");
      expect(data.notes![0].content).toBe("File note");
    });

    test("extracts from groups (nested structure)", () => {
      const fileEl = {
        "@_original": "Grouped.json",
        "@_trgLang": "zh",
        group: {
          unit: {
            "@_id": "u1",
            "@_name": "nested",
            segment: { source: "A", target: "甲" },
          },
        },
      };
      const result = extractResourceFromXliffFile(
        fileEl as unknown as Record<string, unknown>,
        "zh",
        project,
        ["zh"]
      );
      expect(result).toBeInstanceOf(MsgResource);
      expect(result!.title).toBe("Grouped");
      const data = result!.getData(true);
      expect(data.messages).toHaveLength(1);
      expect(data.messages![0].key).toBe("nested");
      expect(data.messages![0].value).toBe("甲");
    });

    test("extracts segment with target as string", () => {
      const fileEl = {
        "@_original": "S.json",
        "@_trgLang": "zh",
        unit: {
          "@_id": "u1",
          "@_name": "k",
          segment: { source: "Hi", target: "你好" },
        },
      };
      const result = extractResourceFromXliffFile(
        fileEl as unknown as Record<string, unknown>,
        "zh",
        project,
        ["zh"]
      );
      expect(result!.getData(true).messages![0].value).toBe("你好");
    });

    test("extracts segment with target as object (inline elements)", () => {
      const fileEl = {
        "@_original": "I.json",
        "@_trgLang": "zh",
        unit: {
          "@_id": "u1",
          "@_name": "k",
          segment: {
            source: "Hello",
            target: { "#text": "你好" },
          },
        },
      };
      const result = extractResourceFromXliffFile(
        fileEl as unknown as Record<string, unknown>,
        "zh",
        project,
        ["zh"]
      );
      expect(result!.getData(true).messages![0].value).toBe("你好");
    });

    test("extracts segment with target having nested pc element", () => {
      const fileEl = {
        "@_original": "N.json",
        "@_trgLang": "zh",
        unit: {
          "@_id": "u1",
          "@_name": "k",
          segment: {
            target: {
              pc: { "#text": "Hello " },
              "#text": "world",
            },
          },
        },
      };
      const result = extractResourceFromXliffFile(
        fileEl as unknown as Record<string, unknown>,
        "zh",
        project,
        ["zh"]
      );
      expect(result!.getData(true).messages![0].value).toContain("Hello");
      expect(result!.getData(true).messages![0].value).toContain("world");
    });

    test("extracts segment with target having array of inline elements", () => {
      const fileEl = {
        "@_original": "A.json",
        "@_trgLang": "zh",
        unit: {
          "@_id": "u1",
          "@_name": "k",
          segment: {
            target: {
              pc: [{ "#text": "Part1" }, { "#text": "Part2" }],
            },
          },
        },
      };
      const result = extractResourceFromXliffFile(
        fileEl as unknown as Record<string, unknown>,
        "zh",
        project,
        ["zh"]
      );
      expect(result!.getData(true).messages![0].value).toBe("Part1Part2");
    });

    test("extracts from nested groups", () => {
      const fileEl = {
        "@_original": "Nested.json",
        "@_trgLang": "zh",
        group: {
          group: {
            unit: {
              "@_id": "u1",
              "@_name": "deep",
              segment: { source: "X", target: "深" },
            },
          },
        },
      };
      const result = extractResourceFromXliffFile(
        fileEl as unknown as Record<string, unknown>,
        "zh",
        project,
        ["zh"]
      );
      expect(result!.getData(true).messages![0].key).toBe("deep");
      expect(result!.getData(true).messages![0].value).toBe("深");
    });

    test("extracts unit with translate=false and trgDir", () => {
      const fileEl = {
        "@_original": "A.json",
        "@_trgLang": "zh",
        unit: {
          "@_id": "u1",
          "@_name": "k",
          "@_translate": "false",
          "@_trgDir": "ltr",
          segment: { source: "X", target: "Y" },
        },
      };
      const result = extractResourceFromXliffFile(
        fileEl as unknown as Record<string, unknown>,
        "zh",
        project,
        ["zh"]
      );
      expect(result).toBeInstanceOf(MsgResource);
      const data = result!.getData(false);
      expect(data.messages![0].attributes?.dnt).toBe(true);
      expect(data.messages![0].attributes?.dir).toBe("ltr");
    });

    test("handles unit with empty segments array", () => {
      const fileEl = {
        "@_original": "E.json",
        "@_trgLang": "zh",
        unit: {
          "@_id": "u1",
          "@_name": "empty",
          segment: [],
        },
      };
      const result = extractResourceFromXliffFile(
        fileEl as unknown as Record<string, unknown>,
        "zh",
        project,
        ["zh"]
      );
      expect(result!.getData(true).messages![0].value).toBe("");
    });

    test("handles unit with null in segments (extractSegmentText null path)", () => {
      const fileEl = {
        "@_original": "N.json",
        "@_trgLang": "zh",
        unit: {
          "@_id": "u1",
          "@_name": "k",
          segment: [null],
        },
      };
      const result = extractResourceFromXliffFile(
        fileEl as unknown as Record<string, unknown>,
        "zh",
        project,
        ["zh"]
      );
      expect(result!.getData(true).messages![0].value).toBe("");
    });

    test("extracts unit with @_id when @_name missing", () => {
      const fileEl = {
        "@_original": "A.json",
        "@_trgLang": "zh",
        unit: {
          "@_id": "my-id",
          segment: { source: "S", target: "T" },
        },
      };
      const result = extractResourceFromXliffFile(
        fileEl as unknown as Record<string, unknown>,
        "zh",
        project,
        ["zh"]
      );
      expect(result!.getData(true).messages![0].key).toBe("my-id");
    });

    test("extracts note category x- prefix and unknown category", () => {
      const fileEl = {
        "@_original": "R.json",
        "@_trgLang": "zh",
        unit: {
          "@_id": "u1",
          "@_name": "k1",
          notes: {
            note: [
              { "@_category": "x-custom", "#text": "Custom" },
              { "@_category": "unknown", "#text": "Unknown" },
            ],
          },
          segment: { source: "S", target: "T" },
        },
      };
      const result = extractResourceFromXliffFile(
        fileEl as unknown as Record<string, unknown>,
        "zh",
        project,
        ["zh"]
      );
      const data = result!.getData(false);
      expect(data.messages![0].notes).toHaveLength(2);
      expect(data.messages![0].notes![0].type).toBe("X-CUSTOM");
      expect(data.messages![0].notes![1].type).toBe("UNKNOWN");
    });

    test("extracts multiple segments in unit", () => {
      const fileEl = {
        "@_original": "M.json",
        "@_trgLang": "zh",
        unit: {
          "@_id": "u1",
          "@_name": "k",
          segment: [
            { source: "A", target: "一" },
            { source: "B", target: "二" },
          ],
        },
      };
      const result = extractResourceFromXliffFile(
        fileEl as unknown as Record<string, unknown>,
        "zh",
        project,
        ["zh"]
      );
      expect(result!.getData(true).messages![0].value).toBe("一二");
    });

    test("uses file @_trgLang over xliff root", () => {
      const fileEl = {
        "@_original": "F.json",
        "@_trgLang": "zh",
        unit: {
          "@_id": "u1",
          "@_name": "k",
          segment: { source: "S", target: "T" },
        },
      };
      const result = extractResourceFromXliffFile(
        fileEl as unknown as Record<string, unknown>,
        "fr",
        project,
        ["zh"]
      );
      expect(result).toBeInstanceOf(MsgResource);
      expect(result!.attributes.lang).toBe("zh");
    });
  });

  describe("processXliffFile", () => {
    let tmp: string;

    beforeEach(() => {
      tmp = join(tmpdir(), `msg-import-process-${Date.now()}`);
      mkdirSync(tmp, { recursive: true });
      mkdirSync(join(tmp, "xliff"), { recursive: true });
      mkdirSync(join(tmp, "projects"), { recursive: true });
      writeFileSync(
        join(tmp, "xliff", "test.zh.xliff"),
        readFileSync(join(FIXTURES_XLIFF, "test.zh.xliff"), "utf-8")
      );
      writeFileSync(
        join(tmp, "projects", "test.ts"),
        readFileSync(join(FIXTURES_PROJECTS, "test.ts"), "utf-8")
      );
    });

    afterEach(() => {
      rmSync(tmp, { recursive: true, force: true });
    });

    test("returns ImportResult for valid bilingual XLIFF", async () => {
      const xliffPath = join(tmp, "xliff", "test.zh.xliff");
      const result = await processXliffFile(
        xliffPath,
        join(tmp, "projects"),
        "test",
        "zh"
      );
      expect(result).not.toBeNull();
      expect(result!.project).toBe("test");
      expect(result!.locale).toBe("zh");
      expect(result!.resources).toHaveLength(1);
      expect(result!.resources[0].title).toBe("Example");
      const json = JSON.parse(result!.resources[0].json);
      expect(json.messages).toHaveLength(2);
      expect(json.messages[0].value).toBe("你好");
    });

    test("returns null when project not found", async () => {
      const result = await processXliffFile(
        join(tmp, "xliff", "test.zh.xliff"),
        join(tmp, "projects"),
        "nonexistent",
        "zh"
      );
      expect(result).toBeNull();
    });

    test("returns null when locale not in targetLocales", async () => {
      const result = await processXliffFile(
        join(tmp, "xliff", "test.zh.xliff"),
        join(tmp, "projects"),
        "test",
        "ja"
      );
      expect(result).toBeNull();
    });

    test("throws on malformed XLIFF", async () => {
      writeFileSync(join(tmp, "xliff", "bad.xliff"), "not valid xml <<<");
      await expect(
        processXliffFile(
          join(tmp, "xliff", "bad.xliff"),
          join(tmp, "projects"),
          "test",
          "zh"
        )
      ).rejects.toThrow(/Malformed|parse/);
    });

    test("returns null when xliff root has no xliff element", async () => {
      const badStructure = '<?xml version="1.0"?><root></root>';
      writeFileSync(join(tmp, "xliff", "badroot.xliff"), badStructure);
      const result = await processXliffFile(
        join(tmp, "xliff", "badroot.xliff"),
        join(tmp, "projects"),
        "test",
        "zh"
      );
      expect(result).toBeNull();
    });

    test("returns null when xliff is monolingual (no trgLang)", async () => {
      const monolingual = `<?xml version="1.0" encoding="UTF-8"?>
<xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" version="2.0" srcLang="en">
  <file id="f1" original="Example.json">
    <unit id="u1" name="hello">
      <segment><source>Hello</source></segment>
    </unit>
  </file>
</xliff>`;
      writeFileSync(join(tmp, "xliff", "mono.xliff"), monolingual);
      const result = await processXliffFile(
        join(tmp, "xliff", "mono.xliff"),
        join(tmp, "projects"),
        "test",
        "zh"
      );
      expect(result).toBeNull();
    });

    test("processes multiple file elements", async () => {
      const multiFile = `<?xml version="1.0" encoding="UTF-8"?>
<xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" version="2.0" srcLang="en" trgLang="zh">
  <file id="f1" original="A.json">
    <unit id="u1" name="a"><segment><source>A</source><target>甲</target></segment></unit>
  </file>
  <file id="f2" original="B.json">
    <unit id="u2" name="b"><segment><source>B</source><target>乙</target></segment></unit>
  </file>
</xliff>`;
      writeFileSync(join(tmp, "xliff", "multi.xliff"), multiFile);
      const result = await processXliffFile(
        join(tmp, "xliff", "multi.xliff"),
        join(tmp, "projects"),
        "test",
        "zh"
      );
      expect(result).not.toBeNull();
      expect(result!.resources).toHaveLength(2);
      expect(result!.resources[0].title).toBe("A");
      expect(result!.resources[1].title).toBe("B");
    });

    test("importMsgProject uses .js when .ts not found", async () => {
      writeFileSync(
        join(tmp, "projects", "test.js"),
        readFileSync(join(FIXTURES_PROJECTS, "test.ts"), "utf-8")
      );
      rmSync(join(tmp, "projects", "test.ts"));
      writeFileSync(join(tmp, "xliff", "test.zh.xliff"), readFileSync(join(FIXTURES_XLIFF, "test.zh.xliff"), "utf-8"));
      const result = await processXliffFile(
        join(tmp, "xliff", "test.zh.xliff"),
        join(tmp, "projects"),
        "test",
        "zh"
      );
      expect(result).not.toBeNull();
    });
  });

  describe("importMsgProject", () => {
    let tmp: string;

    beforeEach(() => {
      tmp = join(tmpdir(), `msg-import-proj-${Date.now()}`);
      mkdirSync(tmp, { recursive: true });
    });

    afterEach(() => {
      rmSync(tmp, { recursive: true, force: true });
    });

    test("throws when project file not found", async () => {
      await expect(importMsgProject(tmp, "nonexistent")).rejects.toThrow(
        /Project file not found/
      );
    });

    test("throws when project file does not export valid MsgProject", async () => {
      writeFileSync(join(tmp, "bad.ts"), "export default { foo: 1 };");
      await expect(importMsgProject(tmp, "bad")).rejects.toThrow(
        /does not export a valid MsgProject/
      );
    });
  });

  describe("writeTranslationFiles", () => {
    let tmp: string;

    beforeEach(() => {
      tmp = join(tmpdir(), `msg-import-write-${Date.now()}`);
      mkdirSync(tmp, { recursive: true });
    });

    afterEach(() => {
      rmSync(tmp, { recursive: true, force: true });
    });

    test("creates project and locale directories", async () => {
      const result: ImportResult = {
        project: "myApp",
        locale: "zh",
        resources: [{ title: "Messages", json: '{"title":"Messages","attributes":{},"messages":[]}' }],
      };
      await writeTranslationFiles(tmp, result);
      expect(existsSync(join(tmp, "myApp", "zh", "Messages.json"))).toBe(true);
    });

    test("writes JSON without notes (minimal)", async () => {
      const result: ImportResult = {
        project: "p",
        locale: "fr",
        resources: [
          {
            title: "R",
            json: JSON.stringify({
              title: "R",
              attributes: { lang: "fr", dir: "", dnt: false },
              messages: [{ key: "k1", value: "v1", attributes: {} }],
            }),
          },
        ],
      };
      await writeTranslationFiles(tmp, result);
      const content = readFileSync(join(tmp, "p", "fr", "R.json"), "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed.notes).toBeUndefined();
      expect(parsed.messages[0].value).toBe("v1");
    });
  });
});
