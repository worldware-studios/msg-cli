import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import ts from "typescript";
import { generateMsgResourceContent } from "../lib/create-resource-helpers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_ROOT = join(__dirname, "..", "..");

/** The JSDoc const assertion the generator wraps sample messages in. */
const CONST_ASSERTION = "/** @type {const} */ ";

/** TS2345: Argument of type 'X' is not assignable to parameter of type 'Y'. */
const TS_ARGUMENT_NOT_ASSIGNABLE = 2345;

/** A diagnostic reduced to what the assertions need. */
interface SimpleDiagnostic {
  file: string;
  line: number;
  code: number;
  message: string;
}

/**
 * Type-checks the given JS files the way a user's editor or `tsc --checkJs`
 * would, resolving `@worldware/msg` through the symlinked node_modules and
 * the `#i18n/*` alias (set up by `msg init`) through `paths`.
 */
function typeCheck(root: string, rootFiles: string[]): SimpleDiagnostic[] {
  const options: ts.CompilerOptions = {
    allowJs: true,
    checkJs: true,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    paths: { "#i18n/*": [join(root, "i18n", "*")] },
  };
  const program = ts.createProgram(rootFiles, options);
  return ts.getPreEmitDiagnostics(program).map((d) => {
    const line =
      d.file && d.start !== undefined
        ? d.file.getLineAndCharacterOfPosition(d.start).line + 1
        : 0;
    return {
      file: d.file?.fileName ?? "",
      line,
      code: d.code,
      message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
    };
  });
}

/** Consumer that uses two valid keys (lines 2-3) and one typo (line 4). */
const CONSUMER = `import { resource } from './i18n/resources/Messages.msg.js';
resource.get('sampleKey');
resource.get('sampleKey2');
resource.get('nope');
`;
const TYPO_LINE = 4;

describe("generated MsgResource typing (ESM)", () => {
  let tmp: string;
  let resourcePath: string;
  let consumerPath: string;

  /** Writes the resource file and returns diagnostics for it and the consumer. */
  function checkResource(content: string): SimpleDiagnostic[] {
    writeFileSync(resourcePath, content);
    return typeCheck(tmp, [resourcePath, consumerPath]);
  }

  beforeAll(() => {
    tmp = join(tmpdir(), `msg-cr-types-${Date.now()}`);
    mkdirSync(join(tmp, "i18n", "projects"), { recursive: true });
    mkdirSync(join(tmp, "i18n", "resources"), { recursive: true });
    const nodeModules = join(CLI_ROOT, "node_modules");
    if (existsSync(nodeModules)) {
      symlinkSync(nodeModules, join(tmp, "node_modules"), "dir");
    }
    // Stand-in for a generated MsgProject: only its type matters here.
    writeFileSync(
      join(tmp, "i18n", "projects", "Main.d.ts"),
      `import type { MsgProject } from '@worldware/msg';
declare const project: MsgProject;
export default project;
`
    );
    resourcePath = join(tmp, "i18n", "resources", "Messages.msg.js");
    consumerPath = join(tmp, "consumer.js");
    writeFileSync(consumerPath, CONSUMER);
  });

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  const generated = () =>
    generateMsgResourceContent({
      title: "Messages",
      projectName: "Main",
      sourceLocale: "en",
      dir: "ltr",
      isEsm: true,
    });

  test("infers message keys: valid keys compile, unknown key is an error", () => {
    const diagnostics = checkResource(generated());

    expect(diagnostics.filter((d) => d.file === resourcePath)).toEqual([]);
    const consumerErrors = diagnostics.filter((d) => d.file === consumerPath);
    expect(consumerErrors).toHaveLength(1);
    expect(consumerErrors[0]).toMatchObject({
      line: TYPO_LINE,
      code: TS_ARGUMENT_NOT_ASSIGNABLE,
    });
    expect(consumerErrors[0]?.message).toContain("'nope'");
  });

  test("without the const assertion keys stay untyped (typing is opt-in)", () => {
    const content = generated();
    expect(content).toContain(CONST_ASSERTION);

    const diagnostics = checkResource(content.replace(CONST_ASSERTION, ""));

    expect(diagnostics).toEqual([]);
  });
});
