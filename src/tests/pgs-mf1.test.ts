import { describe, expect, test } from "vitest";
import {
  mf1MessageToPgsExport,
  pgsImportToMf1Message,
} from "../lib/pgs-mf1.js";

describe("pgs-mf1", () => {
  test("export plural message to PGS segments", () => {
    const src = "{count, plural, one {# file} other {# files}}";
    const exp = mf1MessageToPgsExport(src);
    expect(exp).not.toBeNull();
    expect(exp!.switchAttr).toBe("plural:count");
    expect(exp!.segments).toHaveLength(2);
    expect(exp!.segments[0]!.caseAttr).toBe("one");
    expect(exp!.segments[1]!.caseAttr).toBe("other");
    expect(exp!.segments[0]!.sourcePattern).toBe("# file");
    expect(exp!.segments[1]!.sourcePattern).toBe("# files");
  });

  test("export selectordinal uses ordinal switch", () => {
    const src =
      "{p, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}";
    const exp = mf1MessageToPgsExport(src);
    expect(exp).not.toBeNull();
    expect(exp!.switchAttr).toBe("ordinal:p");
  });

  test("export select with gender-like keys maps to gender", () => {
    // After MF1→MF2 lift, string selectors with gender keys classify as gender.
    // ICU male/female map to literal keys; gender classification uses feminine/masculine.
    const src =
      "{g, select, feminine {Her party} masculine {His party} other {Their party}}";
    const exp = mf1MessageToPgsExport(src);
    expect(exp).not.toBeNull();
    expect(exp!.switchAttr).toBe("gender:g");
    expect(exp!.segments.map((s) => s.caseAttr)).toEqual([
      "feminine",
      "masculine",
      "other",
    ]);
  });

  test("export select with non-gender keys maps to select", () => {
    const src =
      "{color, select, red {Red} blue {Blue} other {Other}}";
    const exp = mf1MessageToPgsExport(src);
    expect(exp).not.toBeNull();
    expect(exp!.switchAttr).toBe("select:color");
  });

  test("returns null for plain text and simple placeholders", () => {
    expect(mf1MessageToPgsExport("Hello")).toBeNull();
    expect(mf1MessageToPgsExport("Hello {name}")).toBeNull();
  });

  test("round-trip plural via PGS import", () => {
    const src = "{count, plural, one {one file} other {# files}}";
    const exp = mf1MessageToPgsExport(src);
    expect(exp).not.toBeNull();
    const back = pgsImportToMf1Message(
      exp!.switchAttr,
      exp!.segments.map((s) => ({
        caseAttr: s.caseAttr,
        body: s.sourcePattern,
      }))
    );
    expect(back).not.toBeNull();
    // Structural ICU equivalence: same arg, type, and case keys.
    expect(back).toMatch(/\{count,\s*plural,/);
    expect(back).toMatch(/\bone\s*\{/);
    expect(back).toMatch(/\bother\s*\{/);
  });

  test("import reconstructs selectordinal", () => {
    const back = pgsImportToMf1Message("ordinal:n", [
      { caseAttr: "one", body: "1st" },
      { caseAttr: "other", body: "nth" },
    ]);
    expect(back).not.toBeNull();
    expect(back).toMatch(/\{n,\s*selectordinal,/);
    expect(back).toContain("one {1st}");
    expect(back).toContain("other {nth}");
  });

  test("import nests multi-selector switches", () => {
    const back = pgsImportToMf1Message("gender:g plural:n", [
      { caseAttr: "feminine one", body: "She has one" },
      { caseAttr: "feminine other", body: "She has many" },
      { caseAttr: "other one", body: "They have one" },
      { caseAttr: "other other", body: "They have many" },
    ]);
    expect(back).not.toBeNull();
    expect(back).toMatch(/\{g,\s*select,/);
    expect(back).toMatch(/\{n,\s*plural,/);
  });
});
