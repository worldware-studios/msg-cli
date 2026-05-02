import { describe, expect, test } from "vitest";
import {
  messagesStructurallyEqual,
  parsePgsSwitch,
  pgsImportToSelectMessage,
  selectMessageToPgsExport,
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
});
