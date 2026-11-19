import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
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
  type XmlSpace,
  extractResourceFromXliffFile,
  processXliffFile,
  projectFileExists,
  writeTranslationFiles,
  importMsgProject,
  type ImportResult,
} from "../lib/import-helpers.js";
import { messagesStructurallyEqual } from "../lib/pgs-mf2.js";
import { XMLParser } from "fast-xml-parser";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_XLIFF = join(__dirname, "fixtures", "xliff");
const FIXTURES_PROJECTS = join(__dirname, "fixtures", "projects");

vi.mock("fast-xml-parser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fast-xml-parser")>();
  return {
    XMLParser: class extends actual.XMLParser {
      parse(xml: string) {
        if (
          typeof (globalThis as { __xliffParseReturnNull?: boolean }).__xliffParseReturnNull === "boolean" &&
          (globalThis as { __xliffParseReturnNull?: boolean }).__xliffParseReturnNull
        ) {
          (globalThis as { __xliffParseReturnNull?: boolean }).__xliffParseReturnNull = false;
          return null;
        }
        return super.parse(xml);
      }
    },
  };
});

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
      expect(filterXliffPathsByProject(paths, "proj")).toEqual([]);
    });

    test("keeps files whose parsed project equals the project name", () => {
      const paths = [
        "/a/b/myapp.fr.xliff",
        "/a/b/myapp.de.xliff",
        "/a/b/myapp.xliff",
        "/a/b/other.de.xliff",
      ];
      expect(filterXliffPathsByProject(paths, "myapp")).toEqual([
        "/a/b/myapp.fr.xliff",
        "/a/b/myapp.de.xliff",
        "/a/b/myapp.xliff",
      ]);
    });

    test("drops projects that only share a prefix (#56)", () => {
      const paths = ["/x/app.zh.xliff", "/x/app.xliff", "/x/application.zh.xliff", "/x/apps.fr.xliff"];
      expect(filterXliffPathsByProject(paths, "app")).toEqual(["/x/app.zh.xliff", "/x/app.xliff"]);
    });

    test("keeps a file when either reading of a dotted name matches (#68)", () => {
      const paths = ["/x/my.app.xliff", "/x/my.app.zh.xliff", "/x/my.xliff", "/x/my.zh.xliff"];
      // my.app.xliff is project my.app, or project my with locale app.
      expect(filterXliffPathsByProject(paths, "my.app")).toEqual(["/x/my.app.xliff", "/x/my.app.zh.xliff"]);
      expect(filterXliffPathsByProject(paths, "my")).toEqual(["/x/my.app.xliff", "/x/my.xliff", "/x/my.zh.xliff"]);
    });

    test("matches by file name wherever the file sits, not by directory (#56)", () => {
      const paths = [
        "/xliff/zh/myapp.xliff",
        "/xliff/vendor/zh/myapp.xlf",
        // Imports as project "file", so --project myapp must not select it.
        "/xliff/myapp/fr/file.xliff",
        "/srv/myapp/l10n/xliff/other.zh.xliff",
      ];
      expect(filterXliffPathsByProject(paths, "myapp")).toEqual([
        "/xliff/zh/myapp.xliff",
        "/xliff/vendor/zh/myapp.xlf",
      ]);
    });
  });

  describe("filterXliffPathsByLocale", () => {
    let dir: string;
    const xliff = (trgLang?: string) =>
      `<?xml version="1.0"?><xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" version="2.0" srcLang="en"${
        trgLang ? ` trgLang="${trgLang}"` : ""
      }></xliff>`;
    /** Writes each file (relative path → content) under a temp dir; returns absolute paths. */
    function write(files: Record<string, string>): string[] {
      return Object.entries(files).map(([rel, content]) => {
        const p = join(dir, rel);
        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, content);
        return p;
      });
    }
    beforeEach(() => {
      dir = join(tmpdir(), `msg-lang-filter-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      mkdirSync(dir, { recursive: true });
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    test("keeps files whose trgLang is the locale, wherever they sit (#69)", async () => {
      const [flat, nested, named, other] = write({
        "app.xliff": xliff("zh"),
        "vendor/x/app.xliff": xliff("zh"),
        "app.zh.xliff": xliff("zh"),
        "app.fr.xliff": xliff("fr"),
      });
      expect(await filterXliffPathsByLocale([flat!, nested!, named!, other!], "zh")).toEqual([flat, nested, named]);
    });

    test("ignores the path: drops a zh-looking path whose trgLang is another locale (#69)", async () => {
      const paths = write({ "zh/app.xliff": xliff("de"), "app.zh.xliff": xliff("de") });
      expect(await filterXliffPathsByLocale(paths, "zh")).toEqual([]);
    });

    test("matches trgLang case-insensitively", async () => {
      const paths = write({ "app.xliff": xliff("zh-Hant") });
      expect(await filterXliffPathsByLocale(paths, "zh-hant")).toEqual(paths);
    });

    test("drops monolingual files and keeps unparseable ones for import to report", async () => {
      const [mono, bad] = write({ "mono.xliff": xliff(), "bad.xliff": "not xml <<<" });
      expect(await filterXliffPathsByLocale([mono!, bad!], "zh")).toEqual([bad]);
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

    test("handles filename that does not match pattern", () => {
      const result = parseXliffFilename("/a/b/file.xliff");
      expect(result.project).toBe("file");
      expect(result.locale).toBeUndefined();
    });

    test("extracts a project for a short filename", () => {
      const result = parseXliffFilename("/some/path/x.xliff");
      expect(result.project).toBeDefined();
    });

    test("uses the file name as project for a bare .xliff", () => {
      const result = parseXliffFilename("/a/b/c/.xliff");
      expect(result.project).toBeTruthy();
      expect(result.project).not.toBe("");
    });

    // #55: import takes the locale from trgLang (#57), so directories are never
    // guessed as a locale; a short directory such as "app" used to win.
    test.each([
      "/xliff/app/zh/test.xliff",
      "/xliff/zh/test.xliff",
      "/var/tmp/l10n/xliff/test.xliff",
      "/xliff/myproj/zh/.xlf",
    ])("takes the locale from the file name only, never a directory: %s", (path) => {
      const result = parseXliffFilename(path);
      expect(result.locale).toBeUndefined();
      expect(result.project).toBeTruthy();
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

    test("throws with 'Failed to parse XLIFF' when parser returns null", () => {
      (globalThis as { __xliffParseReturnNull?: boolean }).__xliffParseReturnNull = true;
      expect(() => parseXliff20("<xliff></xliff>")).toThrow(/Failed to parse XLIFF/);
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
      expect(data.messages![0]).toMatchObject({ key: "hello", value: "你好" });
      expect(data.messages![1].value).toBe("世界");
    });

    test("rebuilds MF2 .match message from PGS segments (target text)", () => {
      const expectedZh = `.input {$n :number}
.match $n
one {{一}}
* {{多}}`;
      const fileEl = {
        "@_original": "P.json",
        "@_trgLang": "zh",
        unit: {
          "@_id": "u1",
          "@_name": "countMsg",
          "@_pgs:switch": "plural:n",
          segment: [
            {
              "@_id": "u1_s1",
              "@_pgs:case": "one",
              source: "One",
              target: "一",
            },
            {
              "@_id": "u1_s2",
              "@_pgs:case": "other",
              source: "Many",
              target: "多",
            },
          ],
        },
      };
      const result = extractResourceFromXliffFile(
        fileEl as unknown as Record<string, unknown>,
        "zh",
        project,
        ["zh"]
      );
      expect(result).toBeInstanceOf(MsgResource);
      const data = result!.getData(true);
      expect(data.messages).toHaveLength(1);
      expect(messagesStructurallyEqual(data.messages![0]!.value, expectedZh)).toBe(
        true
      );
    });

    test("reads unit type into message format attribute", () => {
      const fileEl = {
        "@_original": "R.json",
        "@_trgLang": "zh",
        unit: [
          {
            "@_id": "u1",
            "@_name": "raw",
            "@_type": "msg:NONE",
            segment: { source: "S", target: "T" },
          },
          {
            "@_id": "u2",
            "@_name": "icu",
            "@_type": "msg:MF1",
            segment: { source: "S", target: "{n, plural, other {#}}" },
          },
          {
            "@_id": "u3",
            "@_name": "mf2",
            "@_type": "msg:MF2",
            segment: { source: "S", target: "Hello {$name}" },
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
      const data = result!.getData(true);
      expect(data.messages![0]!.attributes?.format).toBe("NONE");
      expect(data.messages![1]!.attributes?.format).toBe("MF1");
      // MF2 matches the project default, so getData may omit it when inherited.
      expect(
        data.messages![2]!.attributes?.format === "MF2" ||
          data.messages![2]!.attributes?.format === undefined
      ).toBe(true);
    });

    test("rebuilds MF1 plural from PGS when unit type is msg:MF1", () => {
      const fileEl = {
        "@_original": "P.json",
        "@_trgLang": "zh",
        unit: {
          "@_id": "u1",
          "@_name": "files",
          "@_type": "msg:MF1",
          "@_pgs:switch": "plural:count",
          segment: [
            {
              "@_id": "u1_s1",
              "@_pgs:case": "one",
              source: "one file",
              target: "一个文件",
            },
            {
              "@_id": "u1_s2",
              "@_pgs:case": "other",
              source: "# files",
              target: "# 个文件",
            },
          ],
        },
      };
      const result = extractResourceFromXliffFile(
        fileEl as unknown as Record<string, unknown>,
        "zh",
        project,
        ["zh"]
      );
      expect(result).toBeInstanceOf(MsgResource);
      const data = result!.getData(true);
      expect(data.messages).toHaveLength(1);
      expect(data.messages![0]!.attributes?.format).toBe("MF1");
      expect(data.messages![0]!.value).toMatch(/\{count,\s*plural,/);
      expect(data.messages![0]!.value).toContain("一个文件");
      expect(data.messages![0]!.value).toContain("# 个文件");
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

    test("defaults resource dir to auto when file has no trgDir", () => {
      const fileEl = {
        "@_original": "R.json",
        "@_trgLang": "zh",
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
      expect(result!.attributes.dir).toBe("auto");
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

    test("preserves backslash sequences from XLIFF target through JSON.parse", () => {
      const expected = "Hello \\{name\\} tab:\\t nl:\\n slash:\\\\";
      const fileEl = {
        "@_original": "R.json",
        "@_trgLang": "zh",
        unit: {
          "@_id": "u1",
          "@_name": "esc",
          segment: { source: "x", target: expected },
        },
      };
      const result = extractResourceFromXliffFile(
        fileEl as unknown as Record<string, unknown>,
        "zh",
        project,
        ["zh"]
      );
      expect(result!.get("esc")?.value).toBe(expected);
      const parsed = JSON.parse(result!.toJSON(true)) as {
        messages: { value: string }[];
      };
      expect(parsed.messages[0]!.value).toBe(expected);
    });

    test("preserves backslash sequences when parsing real XLIFF XML", () => {
      const expected = "Hello \\{name\\} tab:\\t nl:\\n slash:\\\\";
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<xliff xmlns="urn:oasis:names:tc:xliff:document:2.2" version="2.2" srcLang="en" trgLang="zh">
  <file id="f1" original="R.json">
    <unit id="u1" name="esc">
      <segment>
        <source>x</source>
        <target>${expected}</target>
      </segment>
    </unit>
  </file>
</xliff>`;
      const parsedXml = parseXliff20(xml) as Record<string, unknown>;
      const xliffRoot = parsedXml.xliff as Record<string, unknown>;
      const fileEl = (
        Array.isArray(xliffRoot.file) ? xliffRoot.file[0] : xliffRoot.file
      ) as Record<string, unknown>;
      const result = extractResourceFromXliffFile(fileEl, "zh", project, ["zh"]);
      expect(result!.get("esc")?.value).toBe(expected);
      const parsed = JSON.parse(result!.toJSON(true)) as {
        messages: { value: string }[];
      };
      expect(parsed.messages[0]!.value).toBe(expected);
    });

    test("preserves backslash sequences in PGS MF2 segment bodies", () => {
      const body = "Hello \\{name\\}";
      const fileEl = {
        "@_original": "R.json",
        "@_trgLang": "zh",
        unit: {
          "@_id": "u1",
          "@_name": "items",
          "@_type": "msg:MF2",
          "@_pgs:switch": "plural:n",
          segment: [
            {
              "@_pgs:case": "one",
              source: "one",
              target: body,
            },
            {
              "@_pgs:case": "other",
              source: "other",
              target: body,
            },
          ],
        },
      };
      const result = extractResourceFromXliffFile(
        fileEl as unknown as Record<string, unknown>,
        "zh",
        project,
        ["zh"]
      );
      const value = result!.get("items")?.value ?? "";
      expect(value).toContain("\\{name\\}");
      const parsed = JSON.parse(result!.toJSON(true)) as {
        messages: { value: string }[];
      };
      expect(parsed.messages[0]!.value).toContain("\\{name\\}");
      expect(parsed.messages[0]!.value).not.toContain("\\\\{name\\\\}");
    });

    test("preserves backslash sequences in PGS MF1 segment bodies", () => {
      const body = "Hello \\{name\\}";
      const fileEl = {
        "@_original": "R.json",
        "@_trgLang": "zh",
        unit: {
          "@_id": "u1",
          "@_name": "items",
          "@_type": "msg:MF1",
          "@_pgs:switch": "plural:count",
          segment: [
            { "@_pgs:case": "one", source: "one", target: body },
            { "@_pgs:case": "other", source: "other", target: body },
          ],
        },
      };
      const result = extractResourceFromXliffFile(
        fileEl as unknown as Record<string, unknown>,
        "zh",
        project,
        ["zh"]
      );
      const value = result!.get("items")?.value ?? "";
      // MF1 rebuild parses MF2-style `\{` as a literal brace and ICU-quotes it.
      expect(value).toContain("Hello '{'name'}'");
      const parsed = JSON.parse(result!.toJSON(true)) as {
        messages: { value: string }[];
      };
      expect(parsed.messages[0]!.value).toContain("Hello '{'name'}'");
      expect(parsed.messages[0]!.value).not.toContain("\\\\{");
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

    describe("inline elements (#47)", () => {
      /** Parses a one-unit XLIFF document with the given segment body and imports its value. */
      function importSegment(segmentXml: string): string {
        const xml =
          '<?xml version="1.0"?><xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" version="2.0" srcLang="en" trgLang="zh">' +
          `<file id="f1" original="T.json"><unit id="u1" name="k"><segment>${segmentXml}</segment></unit></file></xliff>`;
        const xliff = (parseXliff20(xml) as Record<string, unknown>).xliff as Record<string, unknown>;
        const result = extractResourceFromXliffFile(xliff.file as Record<string, unknown>, "zh", project, ["zh"]);
        return result!.getData(true).messages![0]!.value;
      }
      const importTarget = (targetXml: string) =>
        importSegment(`<source>x</source><target>${targetXml}</target>`);

      test.each([
        ['Hello <pc id="1">bold</pc> and <pc id="2">more</pc>!', "Hello bold and more!"],
        ['Hi <pc id="1">one</pc>.', "Hi one."],
        ['Hi <ph id="1" equiv="{name}"/>.', "Hi {name}."],
      ])("keeps document order and spacing: %s", (target, expected) => {
        expect(importTarget(target)).toBe(expected);
      });

      test("flattens nested pc and mrk in order", () => {
        expect(importTarget('A <pc id="1">b <mrk id="m1" type="term">c</mrk> d</pc> e')).toBe("A b c d e");
      });

      test("mixes ph with text, preferring equiv over disp and emitting nothing without either", () => {
        expect(
          importTarget('<ph id="1" equiv="{a}" disp="A"/> and <ph id="2" disp="{b}"/>,<ph id="3"/> end')
        ).toBe("{a} and {b}, end");
      });

      test("uses equiv for sc/ec, skips sm/em markers, and decodes cp", () => {
        expect(
          importTarget('<sc id="1" equiv="["/>x<ec startRef="1" equiv="]"/> <sm id="s"/>y<em startRef="s"/><cp hex="263A"/>')
        ).toBe("[x] y\u263A");
      });

      test("substitutes U+FFFD for an invalid or missing cp hex", () => {
        expect(importTarget('a<cp hex="110000"/><cp hex="zz"/><cp/>b')).toBe("a\uFFFD\uFFFD\uFFFDb");
      });

      test("decodes numeric character references in text and attributes (#62)", () => {
        expect(importTarget('a&#160;b&#x263A;&#13;c <ph id="1" equiv="&#123;n&#x7D;"/> &amp;#13;')).toBe(
          "a\u00A0b\u263A\rc {n} &#13;"
        );
      });

      test("decodes each reference once, so escaped references stay literal (#62)", () => {
        expect(importTarget("&amp;lt; &amp;nbsp; &#38;#13; &amp;amp;")).toBe("&lt; &nbsp; &#13; &amp;");
      });

      test("keeps CDATA text in place", () => {
        expect(importTarget("a <![CDATA[<b> & c]]> d")).toBe("a <b> & c d");
      });

      test("decodes entities inside inline content", () => {
        expect(importTarget('<pc id="1">a &amp; b &lt;c&gt;</pc> &quot;d&quot;')).toBe('a & b <c> "d"');
      });

      test("handles a target element that has attributes", () => {
        expect(importSegment('<source>x</source><target xml:lang="zh">Hi <pc id="1">there</pc>!</target>')).toBe(
          "Hi there!"
        );
      });

      test("falls back to source with inline elements when target is missing", () => {
        expect(importSegment('<source>Hi <pc id="1">there</pc>!</source>')).toBe("Hi there!");
      });

      test("keeps numeric-looking text as a string", () => {
        expect(importTarget("42")).toBe("42");
      });

      test("trims leading and trailing whitespace as plain-text targets always have", () => {
        expect(importTarget('  Hi <pc id="1">there</pc>  ')).toBe("Hi there");
        expect(importTarget("  plain  ")).toBe("plain");
      });
    });

    describe("xml:space (#62)", () => {
      /** Parses `<file ...>` content into a key → imported value map. */
      function importFile(
        fileInner: string,
        opts: { fileAttrs?: string; xliffSpace?: XmlSpace } = {}
      ): Record<string, string> {
        const xml =
          '<?xml version="1.0"?><xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" version="2.0" srcLang="en" trgLang="zh">' +
          `<file id="f1" original="T.json" ${opts.fileAttrs ?? ""}>${fileInner}</file></xliff>`;
        const xliff = (parseXliff20(xml) as Record<string, unknown>).xliff as Record<string, unknown>;
        const result = extractResourceFromXliffFile(
          xliff.file as Record<string, unknown>,
          "zh",
          project,
          ["zh"],
          opts.xliffSpace
        );
        return Object.fromEntries(result!.getData(true).messages!.map((m) => [m.key, m.value]));
      }
      const unit = (name: string, target: string, attrs = "", targetAttrs = "") =>
        `<unit id="${name}" name="${name}" ${attrs}><segment><source>x</source><target ${targetAttrs}>${target}</target></segment></unit>`;

      test("default trims leading and trailing XML whitespace only", () => {
        expect(
          importFile(unit("a", "  Total:  ") + unit("b", "Prix\u00A0:\u00A0") + unit("c", "\n\tLine\n"))
        ).toEqual({ a: "Total:", b: "Prix\u00A0:\u00A0", c: "Line" });
      });

      test("unit preserve keeps leading, trailing, internal, and whitespace-only content", () => {
        const p = 'xml:space="preserve"';
        expect(
          importFile(
            unit("a", "Total: ", p) +
              unit("b", "  indented", p) +
              unit("c", "line1\n  line2\n", p) +
              unit("d", " ", p)
          )
        ).toEqual({ a: "Total: ", b: "  indented", c: "line1\n  line2\n", d: " " });
      });

      test("preserve keeps whitespace around inline elements", () => {
        expect(importFile(unit("a", ' <pc id="1">bold</pc> ', 'xml:space="preserve"'))).toEqual({ a: " bold " });
      });

      test("target xml:space overrides the unit's", () => {
        expect(
          importFile(
            unit("a", " t ", "", 'xml:space="preserve"') +
              unit("b", " t ", 'xml:space="preserve"', 'xml:space="default"')
          )
        ).toEqual({ a: " t ", b: "t" });
      });

      test("source xml:space applies when falling back to source", () => {
        expect(
          importFile('<unit id="a" name="a"><segment><source xml:space="preserve"> s </source></segment></unit>')
        ).toEqual({ a: " s " });
      });

      test("inherits from file, group, and nested group, and a closer default overrides", () => {
        expect(
          importFile(
            unit("a", " f ") +
              '<group id="g1" xml:space="default">' +
              unit("b", " g ") +
              '<group id="g2" xml:space="preserve">' +
              unit("c", " n ") +
              "</group></group>",
            { fileAttrs: 'xml:space="preserve"' }
          )
        ).toEqual({ a: " f ", b: "g", c: " n " });
      });

      test("inherits from the xliff root and ignores invalid values", () => {
        expect(importFile(unit("a", " r "), { xliffSpace: "preserve" })).toEqual({ a: " r " });
        expect(importFile(unit("a", " r ", 'xml:space="bogus"'), { xliffSpace: "preserve" })).toEqual({ a: " r " });
        expect(importFile(unit("a", " r ", 'xml:space="bogus"'))).toEqual({ a: "r" });
      });

      test("preserve keeps whitespace in PGS case bodies", () => {
        const value = importFile(
          '<unit id="a" name="a" type="msg:mf2" pgs:switch="plural:n" xml:space="preserve">' +
            '<segment pgs:case="one"><source>x</source><target>{$n} item </target></segment>' +
            '<segment pgs:case="other"><source>x</source><target>{$n} items </target></segment></unit>'
        ).a;
        expect(value).toContain("one {{{$n} item }}");
        expect(value).toContain("* {{{$n} items }}");
      });
    });

    test("extracts segment value from source when target missing", () => {
      const fileEl = {
        "@_original": "S.json",
        "@_trgLang": "zh",
        unit: {
          "@_id": "u1",
          "@_name": "k",
          segment: { source: "Fallback source" },
        },
      };
      const result = extractResourceFromXliffFile(
        fileEl as unknown as Record<string, unknown>,
        "zh",
        project,
        ["zh"]
      );
      expect(result!.getData(true).messages![0].value).toBe("Fallback source");
    });

    test("extracts note categories context, parameters, authorship", () => {
      const fileEl = {
        "@_original": "R.json",
        "@_trgLang": "zh",
        unit: {
          "@_id": "u1",
          "@_name": "k1",
          notes: {
            note: [
              { "@_category": "context", "#text": "Ctx" },
              { "@_category": "parameters", "#text": "Params" },
              { "@_category": "authorship", "#text": "Author" },
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
      expect(data.messages![0].notes).toHaveLength(3);
      expect(data.messages![0].notes!.map((n) => n.type)).toEqual(["CONTEXT", "PARAMETERS", "AUTHORSHIP"]);
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

    test("handles segment with non-string non-object target/source (extractSegmentText fallback)", () => {
      const fileEl = {
        "@_original": "E.json",
        "@_trgLang": "zh",
        unit: {
          "@_id": "u1",
          "@_name": "k",
          segment: { source: 123, target: 456 },
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

    test("passes xml:space from the xliff root down to units (#62)", async () => {
      const xliffPath = join(tmp, "xliff", "space.zh.xliff");
      writeFileSync(
        xliffPath,
        '<?xml version="1.0"?><xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" version="2.0" srcLang="en" trgLang="zh" xml:space="preserve">' +
          '<file id="f1" original="Space.json"><unit id="k" name="k"><segment><source>x</source><target>合计： </target></segment></unit></file></xliff>'
      );
      const result = await processXliffFile(xliffPath, join(tmp, "projects"), "test", "zh");
      const json = JSON.parse(result!.resources[0]!.json) as { messages: { value: string }[] };
      expect(json.messages[0]!.value).toBe("合计： ");
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

    describe("dotted project names (#68)", () => {
      const bilingualZh = () => readFileSync(join(FIXTURES_XLIFF, "test.zh.xliff"), "utf-8");
      beforeEach(() => {
        writeFileSync(join(tmp, "projects", "my.app.ts"), readFileSync(join(FIXTURES_PROJECTS, "test.ts"), "utf-8"));
      });

      test("projectFileExists finds .ts and .js project files only", () => {
        writeFileSync(join(tmp, "projects", "other.js"), "export default {}");
        expect(projectFileExists(join(tmp, "projects"), "my.app")).toBe(true);
        expect(projectFileExists(join(tmp, "projects"), "other")).toBe(true);
        expect(projectFileExists(join(tmp, "projects"), "my")).toBe(false);
      });

      test("imports a bilingual my.app.xliff as project my.app when its locale part is not trgLang", async () => {
        const xliffPath = join(tmp, "xliff", "my.app.xliff");
        writeFileSync(xliffPath, bilingualZh());
        const warn = vi.fn();
        const result = await processXliffFile(xliffPath, join(tmp, "projects"), "my", "app", warn);
        expect(result?.project).toBe("my.app");
        expect(result?.locale).toBe("zh");
        expect(warn).not.toHaveBeenCalled();
      });

      test("still reads my.app.zh.xliff as project my.app, locale zh", async () => {
        const xliffPath = join(tmp, "xliff", "my.app.zh.xliff");
        writeFileSync(xliffPath, bilingualZh());
        const { project, locale } = parseXliffFilename(xliffPath);
        const result = await processXliffFile(xliffPath, join(tmp, "projects"), project, locale);
        expect(result?.project).toBe("my.app");
        expect(result?.locale).toBe("zh");
      });

      test("still warns on a mismatch when no dotted project exists", async () => {
        const xliffPath = join(tmp, "xliff", "test.fr.xliff");
        writeFileSync(xliffPath, bilingualZh());
        const warn = vi.fn();
        expect(await processXliffFile(xliffPath, join(tmp, "projects"), "test", "fr", warn)).toBeNull();
        expect(warn).toHaveBeenCalledWith(
          `Skipping ${xliffPath}: file name locale 'fr' does not match trgLang 'zh'`
        );
      });
    });

    describe("trgLang is the file's locale (#57)", () => {
      const bilingual = (trgLang: string) =>
        `<?xml version="1.0"?><xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" version="2.0" srcLang="en" trgLang="${trgLang}">` +
        '<file id="f1" original="Example.json"><unit id="u1" name="hello"><segment><source>Hello</source><target>T</target></segment></unit></file></xliff>';

      test("skips and warns when the file name locale disagrees with trgLang", async () => {
        const xliffPath = join(tmp, "xliff", "test.fr.xliff");
        writeFileSync(xliffPath, bilingual("zh"));
        const warn = vi.fn();
        const result = await processXliffFile(xliffPath, join(tmp, "projects"), "test", "fr", warn);
        expect(result).toBeNull();
        expect(warn).toHaveBeenCalledWith(
          `Skipping ${xliffPath}: file name locale 'fr' does not match trgLang 'zh'`
        );
      });

      test("matches the file name locale case-insensitively and uses trgLang as the locale", async () => {
        const xliffPath = join(tmp, "xliff", "test.ZH.xliff");
        writeFileSync(xliffPath, bilingual("zh"));
        const warn = vi.fn();
        const result = await processXliffFile(xliffPath, join(tmp, "projects"), "test", "ZH", warn);
        expect(result?.locale).toBe("zh");
        expect(warn).not.toHaveBeenCalled();
      });

      test("imports a bilingual file with no locale in its path", async () => {
        const xliffPath = join(tmp, "xliff", "test.xliff");
        writeFileSync(xliffPath, bilingual("zh"));
        const result = await processXliffFile(xliffPath, join(tmp, "projects"), "test", undefined);
        expect(result?.locale).toBe("zh");
        expect(result?.resources).toHaveLength(1);
      });

      test("returns null without a warning when trgLang is not a target locale", async () => {
        const xliffPath = join(tmp, "xliff", "test.xliff");
        writeFileSync(xliffPath, bilingual("ja"));
        const warn = vi.fn();
        const result = await processXliffFile(xliffPath, join(tmp, "projects"), "test", undefined, warn);
        expect(result).toBeNull();
        expect(warn).not.toHaveBeenCalled();
      });

      test("warns about a monolingual file before looking up the project", async () => {
        const xliffPath = join(tmp, "xliff", "mono.xliff");
        writeFileSync(
          xliffPath,
          '<?xml version="1.0"?><xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" version="2.0" srcLang="en"></xliff>'
        );
        const warn = vi.fn();
        const result = await processXliffFile(xliffPath, join(tmp, "projects"), "nonexistent", undefined, warn);
        expect(result).toBeNull();
        expect(warn).toHaveBeenCalledWith(`Skipping monolingual file (no target locale): ${xliffPath}`);
      });
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

    test("returns null when xliff has no file elements", async () => {
      const noFiles = `<?xml version="1.0" encoding="UTF-8"?>
<xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" version="2.0" srcLang="en" trgLang="zh">
</xliff>`;
      writeFileSync(join(tmp, "xliff", "nofiles.xliff"), noFiles);
      const result = await processXliffFile(
        join(tmp, "xliff", "nofiles.xliff"),
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

    test("loads valid MsgProject from .ts file", async () => {
      writeFileSync(
        join(tmp, "valid.ts"),
        readFileSync(join(FIXTURES_PROJECTS, "test.ts"), "utf-8")
      );
      const project = await importMsgProject(tmp, "valid");
      expect(project).toBeDefined();
      expect(project.locales?.targetLocales).toBeDefined();
      expect(Object.keys(project.locales.targetLocales)).toContain("zh");
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

    test("writes multiple resource files for one ImportResult", async () => {
      const result: ImportResult = {
        project: "app",
        locale: "de",
        resources: [
          { title: "A", json: '{"title":"A","attributes":{},"messages":[]}' },
          { title: "B", json: '{"title":"B","attributes":{},"messages":[]}' },
        ],
      };
      await writeTranslationFiles(tmp, result);
      expect(existsSync(join(tmp, "app", "de", "A.json"))).toBe(true);
      expect(existsSync(join(tmp, "app", "de", "B.json"))).toBe(true);
    });
  });

  describe("edge cases", () => {
    const project = createTestProject();

    /** Extracts the zh resource from a file element, failing if it is skipped. */
    function extract(fileEl: Record<string, unknown>) {
      const resource = extractResourceFromXliffFile(fileEl, "zh", project, ["zh"]);
      expect(resource).not.toBeNull();
      return resource!;
    }

    /** Extracts the zh resource and returns its messages keyed by message key. */
    function messagesByKey(fileEl: Record<string, unknown>) {
      return Object.fromEntries(
        (extract(fileEl).getData().messages ?? []).map((m) => [m.key, m])
      );
    }

    test("findXliffFilePaths ignores entries that are neither files nor directories", async () => {
      const tmp = mkdtempSync(join(tmpdir(), "msg-import-symlink-"));
      try {
        writeFileSync(join(tmp, "a.xliff"), "<xliff/>");
        // A dangling symlink is reported as neither a file nor a directory.
        symlinkSync(join(tmp, "missing-target"), join(tmp, "dangling.xliff"));
        expect(await findXliffFilePaths(tmp)).toEqual([join(tmp, "a.xliff")]);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    test("parseXliff20 reports a generic message when the parser throws a non-Error", () => {
      const spy = vi.spyOn(XMLParser.prototype, "parse").mockImplementationOnce(() => {
        throw "boom";
      });
      try {
        expect(() => parseXliff20("<xliff/>")).toThrow("Malformed XLIFF: Failed to parse XLIFF");
      } finally {
        spy.mockRestore();
      }
    });

    test("unit key falls back to @_id, then to an empty string", () => {
      const byKey = messagesByKey({
        "@_original": "E.json",
        unit: [
          { "@_id": "fromId", segment: { source: "a", target: "A" } },
          { segment: { source: "b", target: "B" } },
        ],
      });
      expect(byKey["fromId"]?.value).toBe("A");
      expect(byKey[""]?.value).toBe("B");
    });

    test("unit without segments imports an empty value", () => {
      const byKey = messagesByKey({ "@_original": "E.json", unit: { "@_name": "empty" } });
      expect(byKey["empty"]?.value).toBe("");
    });

    test("unit and file notes default to the comment category and empty content", () => {
      const resource = extract({
        "@_original": "E.json",
        notes: { note: [{ "#text": "file note" }, { "@_id": "n1" }] },
        unit: {
          "@_name": "k",
          notes: { note: [{ "@_category": "description" }, { "#text": "plain" }] },
          segment: { source: "s", target: "T" },
        },
      });
      expect(resource.notes).toEqual([
        { type: "COMMENT", content: "file note" },
        { type: "COMMENT", content: "" },
      ]);
      expect(resource.get("k")?.notes).toEqual([
        { type: "DESCRIPTION", content: "" },
        { type: "COMMENT", content: "plain" },
      ]);
    });

    test("unit lang and dir that differ from the file are kept; empty values become undefined", () => {
      const byKey = messagesByKey({
        "@_original": "E.json",
        "@_trgDir": "rtl",
        unit: [
          { "@_name": "emptyLang", "@_trgLang": "", "@_trgDir": "", segment: { target: "x" } },
        ],
      });
      const attrs = byKey["emptyLang"]?.attributes;
      // Empty overrides are dropped rather than stored as "", so the message
      // gets the library defaults instead of an empty lang/dir.
      expect(attrs?.lang).toBeUndefined();
      expect(attrs?.dir).toBe("auto");
    });

    test("missing original falls back to unknown.json; empty original yields an empty title", () => {
      expect(extract({ unit: { "@_name": "k", segment: { target: "T" } } }).title).toBe("unknown");
      expect(
        extract({ "@_original": "", unit: { "@_name": "k", segment: { target: "T" } } }).title
      ).toBe("");
    });

    test("collects units from multiple groups, nested groups, and groups with several units", () => {
      const byKey = messagesByKey({
        "@_original": "E.json",
        group: [
          {
            unit: [
              { "@_name": "g1a", segment: { target: "1a" } },
              { "@_name": "g1b", segment: { target: "1b" } },
            ],
          },
          {
            group: [
              { unit: { "@_name": "n1", segment: { target: "n1" } } },
              { unit: { "@_name": "n2", segment: { target: "n2" } } },
            ],
          },
        ],
      });
      expect(Object.keys(byKey).sort()).toEqual(["g1a", "g1b", "n1", "n2"]);
    });

    test("PGS unit whose cases cannot be rebuilt falls back to joined segment text", () => {
      const byKey = messagesByKey({
        "@_original": "E.json",
        unit: {
          "@_name": "pgs",
          "@_pgs:switch": "not a valid switch",
          segment: [
            { "@_pgs:case": "one", target: "A" },
            { "@_pgs:case": "other", target: "B" },
          ],
        },
      });
      expect(byKey["pgs"]?.value).toBe("AB");
    });

    test("importMsgProject rejects a project module whose default export is not an object", async () => {
      const tmp = mkdtempSync(join(tmpdir(), "msg-import-proj-prim-"));
      try {
        writeFileSync(join(tmp, "num.ts"), "export default 42;");
        await expect(importMsgProject(tmp, "num")).rejects.toThrow(
          /does not export a valid MsgProject/
        );
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    test("importMsgProject accepts a module with named locales and no default export", async () => {
      const tmp = mkdtempSync(join(tmpdir(), "msg-import-proj-named-"));
      try {
        writeFileSync(
          join(tmp, "named.ts"),
          "export const locales = { targetLocales: { zh: ['zh'] } };"
        );
        const loaded = await importMsgProject(tmp, "named");
        expect(Object.keys(loaded.locales.targetLocales)).toEqual(["zh"]);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    test("processXliffFile skips file elements whose locale is unsupported", async () => {
      const tmp = mkdtempSync(join(tmpdir(), "msg-import-multi-file-"));
      try {
        writeFileSync(
          join(tmp, "test.ts"),
          readFileSync(join(FIXTURES_PROJECTS, "test.ts"), "utf-8")
        );
        const xliffPath = join(tmp, "test.zh.xliff");
        writeFileSync(
          xliffPath,
          `<?xml version="1.0"?>
<xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" version="2.0" srcLang="en" trgLang="zh">
  <file id="f1" original="Kept.json"><unit name="a"><segment><source>a</source><target>甲</target></segment></unit></file>
  <file id="f2" original="Skipped.json" trgLang="ja"><unit name="b"><segment><source>b</source><target>乙</target></segment></unit></file>
</xliff>`
        );
        const result = await processXliffFile(xliffPath, tmp, "test", "zh");
        expect(result?.resources.map((r) => r.title)).toEqual(["Kept"]);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  });
});
