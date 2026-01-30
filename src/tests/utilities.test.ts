import { beforeEach, describe, expect, test, vi } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  findMsgResourceFiles,
  importMsgResources,
  parseXliff,
  readXliff,
  resourcesToXliffString,
  writeXliff,
  xliffDataToResourceTranslationData,
  xliffToTranslationData,
  writeTranslationData,
} from "../lib/utilities.js";

let parseOverride: ((s: string) => unknown) | null = null;
vi.mock("fast-xml-parser", async (importOriginal) => {
  const mod = await importOriginal<typeof import("fast-xml-parser")>();
  const RealParser = mod.XMLParser;
  return {
    ...mod,
    XMLParser: class MockXMLParser {
      parse(s: string) {
        if (parseOverride) return parseOverride(s);
        return new RealParser({
          ignoreAttributes: false,
          attributeNamePrefix: "@_",
        }).parse(s);
      }
    },
  };
});

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures");

beforeEach(() => {
  parseOverride = null;
});
const MSG_FILES_DIR = join(FIXTURES_DIR, "msg-files");
const XLIFF_DIR = join(FIXTURES_DIR, "xliff");
const OUTPUT_DIR = join(FIXTURES_DIR, "output");

describe("findMsgResourceFiles", () => {
  test("returns array of paths to .msg. files in directory", async () => {
    const result = await findMsgResourceFiles(MSG_FILES_DIR);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.some((p) => p.endsWith("Example.msg.ts"))).toBe(true);
    expect(result.some((p) => p.endsWith("Other.msg.js"))).toBe(true);
    expect(result.some((p) => p.endsWith("plain.ts"))).toBe(false);
  });

  test("returns empty array when no .msg. files in directory", async () => {
    const emptyDir = join(FIXTURES_DIR, "empty-dir");
    if (!existsSync(emptyDir)) mkdirSync(emptyDir, { recursive: true });
    const result = await findMsgResourceFiles(emptyDir);
    expect(result).toEqual([]);
  });
});

describe("importMsgResources", () => {
  test("returns Map with MsgProject keys and MsgResource arrays", async () => {
    const files = await findMsgResourceFiles(MSG_FILES_DIR);
    const result = await importMsgResources(files);
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBeGreaterThan(0);
    for (const [project, resources] of result) {
      expect(project).toBeDefined();
      expect(project.project).toBeDefined();
      expect(Array.isArray(resources)).toBe(true);
      expect(resources.length).toBeGreaterThan(0);
      resources.forEach((r) => {
        expect(r.title).toBeDefined();
        expect(r.size).toBeGreaterThanOrEqual(0);
      });
    }
  });
});

describe("resourcesToXliffString", () => {
  test("returns Map with MsgProject keys and valid xliff strings", async () => {
    const files = await findMsgResourceFiles(MSG_FILES_DIR);
    const imported = await importMsgResources(files);
    const resources: import("@worldware/msg").MsgResource[] = [];
    for (const arr of imported.values()) {
      resources.push(...arr);
    }
    const result = await resourcesToXliffString(resources);
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBeGreaterThan(0);
    for (const xliff of result.values()) {
      expect(typeof xliff).toBe("string");
      expect(xliff).toContain('version="1.2"');
      expect(xliff).toContain("<xliff");
      expect(xliff).toContain("<file");
      expect(xliff).toContain("<trans-unit");
    }
  });
});

describe("writeXliff", () => {
  test("writes xliff string to file and returns void", async () => {
    const outputPath = join(OUTPUT_DIR, "test-output.xliff");
    if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
    const xliff = '<?xml version="1.0"?><xliff version="1.2"><file original="test"><body></body></file></xliff>';
    await writeXliff(outputPath, xliff);
    expect(existsSync(outputPath)).toBe(true);
    const content = readFileSync(outputPath, "utf-8");
    expect(content).toContain("xliff");
  });
});

describe("readXliff", () => {
  test("returns file contents when path is readable", async () => {
    const validPath = join(XLIFF_DIR, "valid.xliff");
    const result = await readXliff(validPath);
    expect(typeof result).toBe("string");
    expect(result).toContain("xliff");
    expect(result).toContain("trans-unit");
  });
});

describe("parseXliff", () => {
  test("parses valid xliff 1.2 string to javascript object", async () => {
    const xliff = readFileSync(join(XLIFF_DIR, "valid.xliff"), "utf-8");
    const result = await parseXliff(xliff);
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();
  });

  test("throws when parser returns null or non-object", async () => {
    parseOverride = () => null;
    await expect(parseXliff("<xliff/>")).rejects.toThrow(
      "Invalid XLIFF: failed to parse"
    );
  });
});

describe("xliffDataToResourceTranslationData", () => {
  test("extracts translations to MsgResourceData objects", async () => {
    const xliff = readFileSync(join(XLIFF_DIR, "valid.xliff"), "utf-8");
    const parsed = await parseXliff(xliff);
    const result = await xliffDataToResourceTranslationData(parsed);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    const first = result[0];
    expect(first.title).toBeDefined();
    expect(first.attributes).toBeDefined();
    expect(first.attributes.lang).toBe("zh");
    expect(first.messages).toBeDefined();
    expect(first.messages!.length).toBe(2);
    expect(first.messages!.find((m) => m.key === "test-1")?.value).toBe("这是测试 1");
  });

  test("returns MsgResourceData with empty messages when no trans units", async () => {
    const xliff = readFileSync(join(XLIFF_DIR, "empty-trans-units.xliff"), "utf-8");
    const parsed = await parseXliff(xliff);
    const result = await xliffDataToResourceTranslationData(parsed);
    expect(result.length).toBe(1);
    expect(result[0].messages).toEqual([]);
  });

  test("excludes trans-units where translate is no", async () => {
    const xliff = readFileSync(join(XLIFF_DIR, "translate-no.xliff"), "utf-8");
    const parsed = await parseXliff(xliff);
    const result = await xliffDataToResourceTranslationData(parsed);
    expect(result.length).toBe(1);
    expect(result[0].messages!.length).toBe(1);
    expect(result[0].messages![0].key).toBe("translate-me");
  });
});

describe("xliffToTranslationData", () => {
  test("parses xliff string and returns MsgResourceData array", async () => {
    const xliff = readFileSync(join(XLIFF_DIR, "valid.xliff"), "utf-8");
    const result = await xliffToTranslationData(xliff);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("Error handling", () => {
  test("parseXliff throws on invalid xliff string", async () => {
    const invalid = readFileSync(join(XLIFF_DIR, "invalid.xliff"), "utf-8");
    await expect(parseXliff(invalid)).rejects.toThrow(/Invalid XLIFF/);
  });

  test("importMsgResources throws when file lacks .msg. in filename", async () => {
    await expect(
      importMsgResources([join(FIXTURES_DIR, "msg-files", "plain.ts")])
    ).rejects.toThrow(/\.msg\./);
  });

  test("importMsgResources throws when file does not export MsgResource", async () => {
    const invalidPath = join(FIXTURES_DIR, "msg-files-invalid", "Invalid.msg.ts");
    await expect(importMsgResources([invalidPath])).rejects.toThrow(
      /Failed to import MsgResource|no valid export/
    );
  });
});

describe("writeTranslationData", () => {
  test("serializes MsgResourceData to JSON file", async () => {
    const outputPath = join(OUTPUT_DIR, "TestResource.json");
    if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
    const data = {
      title: "TestResource",
      attributes: { lang: "en", dir: "ltr", dnt: false },
      messages: [{ key: "hello", value: "Hello" }],
    };
    await writeTranslationData(outputPath, data);
    expect(existsSync(outputPath)).toBe(true);
    const content = JSON.parse(readFileSync(outputPath, "utf-8"));
    expect(content.title).toBe("TestResource");
    expect(content.messages).toEqual([{ key: "hello", value: "Hello" }]);
  });
});
