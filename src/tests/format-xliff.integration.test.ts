import { describe, expect, test } from "vitest";
import { MsgProject, MsgResource } from "@worldware/msg";
import {
  serializeResourceGroupsToXliff,
  type ResourceGroup,
} from "../lib/export-helpers.js";
import {
  extractResourceFromXliffFile,
  parseXliff20,
} from "../lib/import-helpers.js";

/** Creates a project with optional format and zh target locale for import. */
function createProject(
  name: string,
  opts?: { format?: "NONE" | "MF1" | "MF2" }
) {
  return MsgProject.create({
    project: { name, ...(opts?.format ? { format: opts.format } : {}) },
    locales: {
      sourceLocale: "en",
      pseudoLocale: "en-XA",
      targetLocales: { en: ["en"], zh: ["zh"] },
    },
    loader: async () => ({
      title: "",
      attributes: { lang: "", dir: "", dnt: false },
      messages: [],
    }),
  });
}

/**
 * Turns a monolingual export XLIFF into a bilingual file for import tests:
 * sets trgLang and copies each <source> as <target>.
 */
function toBilingualXliff(xliff: string, trgLang: string): string {
  let out = xliff.replace(
    /<xliff([^>]*?)>/,
    (match, attrs: string) => {
      if (/\btrgLang=/.test(attrs)) {
        return match.replace(/trgLang="[^"]*"/, `trgLang="${trgLang}"`);
      }
      return `<xliff${attrs} trgLang="${trgLang}">`;
    }
  );
  out = out.replace(
    /<file([^>]*?)>/,
    (match, attrs: string) => {
      if (/\btrgLang=/.test(attrs)) return match;
      return `<file${attrs} trgLang="${trgLang}">`;
    }
  );
  out = out.replace(
    /<source>([\s\S]*?)<\/source>/g,
    (_m, body: string) => `<source>${body}</source>\n        <target>${body}</target>`
  );
  return out;
}

describe("format XLIFF integration", () => {
  test("export→import round-trip preserves NONE/MF1/MF2 and MF1 PGS plurals", () => {
    const project = createProject("fmtApp", { format: "MF2" });
    const resource = MsgResource.create(
      {
        title: "Strings",
        attributes: { lang: "en", dir: "ltr", dnt: false },
        messages: [
          {
            key: "raw",
            value: "literal {x}",
            attributes: { format: "NONE" },
          },
          {
            key: "files",
            value: "{count, plural, one {# file} other {# files}}",
            attributes: { format: "MF1" },
          },
          {
            key: "hello",
            value: "Hello {$name}",
            attributes: { format: "MF2" },
          },
        ],
      },
      project
    );

    const groups: ResourceGroup[] = [
      { project: "fmtApp", resources: [resource] },
    ];
    const exported = serializeResourceGroupsToXliff(groups)[0]!.xliff;

    expect(exported).toMatch(/name="raw"[^>]*type="msg:NONE"|type="msg:NONE"[^>]*name="raw"/);
    expect(exported).toMatch(/name="files"[^>]*type="msg:MF1"|type="msg:MF1"[^>]*name="files"/);
    expect(exported).toContain('pgs:switch="plural:count"');
    expect(exported).toContain("# file");
    expect(exported).toContain("# files");
    expect(exported).toMatch(/name="hello"[^>]*type="msg:MF2"|type="msg:MF2"[^>]*name="hello"/);

    const bilingual = toBilingualXliff(exported, "zh");
    const parsed = parseXliff20(bilingual);
    const xliffRoot = (parsed as Record<string, unknown>).xliff as Record<
      string,
      unknown
    >;
    const fileEl = (
      Array.isArray(xliffRoot.file) ? xliffRoot.file[0] : xliffRoot.file
    ) as Record<string, unknown>;

    const imported = extractResourceFromXliffFile(
      fileEl,
      "zh",
      project,
      ["zh"]
    );
    expect(imported).not.toBeNull();
    const data = imported!.getData(true);
    expect(data.messages).toHaveLength(3);

    const byKey = Object.fromEntries(
      (data.messages ?? []).map((m) => [m.key, m])
    );
    expect(byKey.raw!.attributes?.format).toBe("NONE");
    expect(byKey.raw!.value).toBe("literal {x}");

    expect(byKey.files!.attributes?.format).toBe("MF1");
    expect(byKey.files!.value).toMatch(/\{count,\s*plural,/);
    expect(byKey.files!.value).toContain("# file");
    expect(byKey.files!.value).toContain("# files");

    expect(
      byKey.hello!.attributes?.format === "MF2" ||
        byKey.hello!.attributes?.format === undefined
    ).toBe(true);
    expect(byKey.hello!.value).toContain("Hello");
  });

  test("MF2 .match export→import round-trip via PGS", () => {
    const project = createProject("mf2App");
    const pluralSrc = `.input {$n :number}
.match $n
one {{One item}}
* {{{$n} items}}`;
    const resource = MsgResource.create(
      {
        title: "R",
        attributes: { lang: "en", dir: "ltr", dnt: false },
        messages: [{ key: "items", value: pluralSrc }],
      },
      project
    );

    const exported = serializeResourceGroupsToXliff([
      { project: "mf2App", resources: [resource] },
    ])[0]!.xliff;
    expect(exported).toContain('type="msg:MF2"');
    expect(exported).toContain('pgs:switch="plural:n"');

    const bilingual = toBilingualXliff(exported, "zh");
    const parsed = parseXliff20(bilingual);
    const xliffRoot = (parsed as Record<string, unknown>).xliff as Record<
      string,
      unknown
    >;
    const fileEl = (
      Array.isArray(xliffRoot.file) ? xliffRoot.file[0] : xliffRoot.file
    ) as Record<string, unknown>;

    const imported = extractResourceFromXliffFile(
      fileEl,
      "zh",
      project,
      ["zh"]
    );
    expect(imported).not.toBeNull();
    const msg = imported!.getData(true).messages![0]!;
    expect(msg.value).toMatch(/\.match/);
    expect(msg.value).toContain("One item");
  });
});
