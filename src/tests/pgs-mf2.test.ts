import { describe, expect, test } from "vitest";
import {
  classifySelectMessageForPgs,
  messagesStructurallyEqual,
  mf2KeyToPgsToken,
  parsePgsSwitch,
  pgsImportToSelectMessage,
  pgsTokenToMf2Key,
  selectMessageDataToPgsExport,
  selectMessageToPgsExport,
  type SelectMessage,
  type VariantKey,
} from "../lib/pgs-mf2.js";

describe("pgs-mf2", () => {
  test("parsePgsSwitch accepts plural and combined selectors", () => {
    expect(parsePgsSwitch("plural:count")).toEqual([
      { kind: "plural", name: "count" },
    ]);
    expect(parsePgsSwitch("plural:guest_count gender:host_gender")).toEqual([
      { kind: "plural", name: "guest_count" },
      { kind: "gender", name: "host_gender" },
    ]);
    expect(parsePgsSwitch("bad:x")).toBeNull();
  });

  test("export plural message to PGS segments", () => {
    const src = `.input {$c :number}
.match $c
|0| {{You deleted no file.}}
|1| {{You deleted one file.}}
* {{You deleted {$c} files.}}`;
    const exp = selectMessageToPgsExport(src);
    expect(exp).not.toBeNull();
    expect(exp!.switchAttr).toBe("plural:c");
    expect(exp!.segments).toHaveLength(3);
    expect(exp!.segments[0]!.caseAttr).toBe("0");
    expect(exp!.segments[1]!.caseAttr).toBe("1");
    expect(exp!.segments[2]!.caseAttr).toBe("other");
  });

  test("round-trip plural via PGS import", () => {
    const src = `.input {$c :number}
.match $c
one {{You deleted one file.}}
* {{You deleted {$c} files.}}`;
    const exp = selectMessageToPgsExport(src);
    expect(exp).not.toBeNull();
    const back = pgsImportToSelectMessage(exp!.switchAttr, [
      {
        caseAttr: exp!.segments[0]!.caseAttr,
        body: exp!.segments[0]!.sourcePattern,
      },
      {
        caseAttr: exp!.segments[1]!.caseAttr,
        body: exp!.segments[1]!.sourcePattern,
      },
    ]);
    expect(back).not.toBeNull();
    expect(messagesStructurallyEqual(src, back!)).toBe(true);
  });

  test("ordinal export uses ordinal switch", () => {
    const src = `.input {$p :number select=ordinal}
.match $p
one {{You won {$p}st place}}
* {{You won {$p}th place}}`;
    const exp = selectMessageToPgsExport(src);
    expect(exp).not.toBeNull();
    expect(exp!.switchAttr).toBe("ordinal:p");
  });

  test("ordinal round-trips export → import unchanged", () => {
    const src = `.input {$p :number select=ordinal}
.match $p
one {{You won {$p}st place}}
* {{You won {$p}th place}}`;
    const exp = selectMessageToPgsExport(src);
    expect(exp).not.toBeNull();
    const back = pgsImportToSelectMessage(
      exp!.switchAttr,
      exp!.segments.map((s) => ({ caseAttr: s.caseAttr, body: s.sourcePattern }))
    );
    expect(back).not.toBeNull();
    expect(back).toContain("select=ordinal");
    expect(messagesStructurallyEqual(src, back!)).toBe(true);
  });

  test("gender-like string selector maps to gender", () => {
    const src = `.input {$g :string}
.match $g
feminine {{Her party}}
masculine {{His party}}
* {{Their party}}`;
    const exp = selectMessageToPgsExport(src);
    expect(exp).not.toBeNull();
    expect(exp!.switchAttr).toBe("gender:g");
    expect(exp!.segments.map((s) => s.caseAttr)).toEqual([
      "feminine",
      "masculine",
      "other",
    ]);
  });

  test("import preserves backslash sequences in segment bodies", () => {
    const body = "Hello \\{name\\} tab:\\t nl:\\n slash:\\\\";
    const back = pgsImportToSelectMessage("plural:n", [
      { caseAttr: "one", body },
      { caseAttr: "other", body },
    ]);
    expect(back).not.toBeNull();
    expect(back).toContain("\\{name\\}");
    expect(back).toContain("\\t");
    expect(back).toContain("\\n");
    const parsed = JSON.parse(JSON.stringify({ value: back })) as { value: string };
    expect(parsed.value).toBe(back);
    expect(parsed.value).not.toContain("\\\\{name\\\\}");
  });

  describe("edge cases", () => {
    /** Builds a one-selector select message over `$x` with the given declaration value. */
    function selectOver(
      declValue: unknown,
      variants: SelectMessage["variants"] = [
        { keys: [{ type: "literal", value: "one" }], value: ["a"] },
        { keys: [{ type: "*" }], value: ["b"] },
      ]
    ): SelectMessage {
      return {
        type: "select",
        declarations: [{ type: "input", name: "x", value: declValue }],
        selectors: [{ type: "variable", name: "x" }],
        variants,
      };
    }
    const numberExpr = (options?: unknown) => ({
      type: "expression",
      functionRef: { type: "function", name: "number", ...(options ? { options } : {}) },
    });
    const stringExpr = { type: "expression", functionRef: { type: "function", name: "string" } };

    test("classify skips unrelated declarations before finding the selector's input", () => {
      const msg = selectOver(numberExpr());
      msg.declarations.unshift({ type: "local", name: "y", value: {} });
      expect(classifySelectMessageForPgs(msg)).toEqual([{ kind: "plural", name: "x" }]);
    });

    test("classify reads select=ordinal from plain-object options and ignores non-literal select values", () => {
      expect(classifySelectMessageForPgs(selectOver(numberExpr({ select: { type: "literal", value: "ordinal" } })))).toEqual([
        { kind: "ordinal", name: "x" },
      ]);
      expect(
        classifySelectMessageForPgs(
          selectOver(numberExpr({ select: { type: "variable", name: "v" } }))
        )
      ).toEqual([{ kind: "plural", name: "x" }]);
    });

    test("classify returns null for unsupported selectors, declarations, and functions", () => {
      const noName: SelectMessage = { ...selectOver(numberExpr()), selectors: [{ type: "variable" }] };
      const literalSelector: SelectMessage = { ...selectOver(numberExpr()), selectors: [{ type: "literal", name: "x" }] };
      const noDecl: SelectMessage = { ...selectOver(numberExpr()), declarations: [] };
      expect(classifySelectMessageForPgs(noName)).toBeNull();
      expect(classifySelectMessageForPgs(literalSelector)).toBeNull();
      expect(classifySelectMessageForPgs(noDecl)).toBeNull();
      expect(classifySelectMessageForPgs(selectOver({ type: "variable", name: "x" }))).toBeNull();
      expect(
        classifySelectMessageForPgs(
          selectOver({ type: "expression", functionRef: { type: "function", name: "datetime" } })
        )
      ).toBeNull();
    });

    test("classify falls back to select when a :string variant has a missing or non-literal key", () => {
      const missingKey = selectOver(stringExpr, [
        { keys: [{ type: "literal", value: "male" }], value: ["a"] },
        { keys: [], value: ["b"] },
      ]);
      const oddKey = selectOver(stringExpr, [
        { keys: [{ type: "markup" } as unknown as VariantKey], value: ["a"] },
        { keys: [{ type: "*" }], value: ["b"] },
      ]);
      expect(classifySelectMessageForPgs(missingKey)).toEqual([{ kind: "select", name: "x" }]);
      expect(classifySelectMessageForPgs(oddKey)).toEqual([{ kind: "select", name: "x" }]);
    });

    test("mf2KeyToPgsToken maps unknown key types to other", () => {
      expect(mf2KeyToPgsToken({ type: "markup" } as unknown as VariantKey, "select")).toBe("other");
    });

    test("pgsTokenToMf2Key maps ordinal other to the catch-all and other tokens to literals", () => {
      expect(pgsTokenToMf2Key("other", "ordinal")).toEqual({ type: "*" });
      expect(pgsTokenToMf2Key("few", "ordinal")).toEqual({ type: "literal", value: "few" });
    });

    test("selectMessageDataToPgsExport returns null for unclassifiable or short-keyed variants", () => {
      expect(selectMessageDataToPgsExport(selectOver({ type: "variable", name: "x" }))).toBeNull();
      const shortKeys = selectOver(numberExpr(), [
        { keys: [{ type: "literal", value: "one" }], value: ["a"] },
        { keys: [], value: ["b"] },
      ]);
      expect(selectMessageDataToPgsExport(shortKeys)).toBeNull();
    });

    test("pgsImportToSelectMessage rejects invalid switches, mismatched cases, and no segments", () => {
      expect(pgsImportToSelectMessage("bogus", [{ caseAttr: "one", body: "a" }])).toBeNull();
      expect(pgsImportToSelectMessage("plural:n", [{ caseAttr: "one two", body: "a" }])).toBeNull();
      expect(pgsImportToSelectMessage("plural:n", [])).toBeNull();
    });

    const ordinalSegments = [
      { caseAttr: "one", body: "{$n}st" },
      { caseAttr: "other", body: "{$n}th" },
    ];

    test("pgsImportToSelectMessage rebuilds ordinal selectors as a :number match", () => {
      const rebuilt = pgsImportToSelectMessage("ordinal:n", ordinalSegments);
      expect(rebuilt).toContain(".input {$n :number");
      expect(rebuilt).toContain("one {{{$n}st}}");
      expect(rebuilt).toContain("* {{{$n}th}}");
    });

    test("pgsImportToSelectMessage keeps select=ordinal", () => {
      expect(pgsImportToSelectMessage("ordinal:n", ordinalSegments)).toContain(
        "select=ordinal"
      );
    });

    test("pgsImportToSelectMessage adds a catch-all variant reusing the last body when none is given", () => {
      const rebuilt = pgsImportToSelectMessage("select:g", [
        { caseAttr: "a", body: "A" },
        { caseAttr: "b", body: "B" },
      ]);
      expect(rebuilt).not.toBeNull();
      expect(rebuilt).toMatch(/\*\s*\{\{B\}\}/);
    });
  });
});
