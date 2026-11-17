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
import { dirname, join } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import CreateProject from "../commands/create/project.js";
import CreateResource from "../commands/create/resource.js";
import Export from "../commands/export.js";
import ImportCmd from "../commands/import.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_ROOT = join(__dirname, "..", "..");

/** Writes the package.json and folders `msg init` would set up. */
function setupInitializedApp(root: string, isEsm: boolean): void {
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify(
      {
        name: "typed-app",
        version: "1.0.0",
        ...(isEsm ? { type: "module" } : {}),
        directories: { i18n: "i18n", l10n: "l10n", root: "." },
        imports: {
          "#i18n/*": "./i18n/*",
          "#l10n/*": "./l10n/*",
          "#root/*": "./*",
        },
      },
      null,
      2
    )
  );
  for (const dir of [
    ["i18n", "projects"],
    ["i18n", "resources"],
    ["l10n", "xliff"],
    ["l10n", "translations"],
  ]) {
    mkdirSync(join(root, ...dir), { recursive: true });
  }
}

/**
 * Turns the exported source-only XLIFF into a French translation by adding
 * trgLang and a <target> after each <source>, as a translator's tool would.
 */
function translateXliff(xliff: string, translations: Record<string, string>): string {
  let out = xliff.replace(/srcLang="en"/, 'srcLang="en" trgLang="fr"');
  for (const [source, target] of Object.entries(translations)) {
    out = out.replace(
      `<source>${source}</source>`,
      `<source>${source}</source><target>${target}</target>`
    );
  }
  return out;
}

describe.each([
  { isEsm: true, label: "ESM" },
  { isEsm: false, label: "CJS" },
])("typed resource end to end ($label)", ({ isEsm }) => {
  let tmp: string;
  let origCwd: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "msg-typed-e2e-"));
    origCwd = process.cwd();
    process.chdir(tmp);
    symlinkSync(join(CLI_ROOT, "node_modules"), join(tmp, "node_modules"), "dir");
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.chdir(origCwd);
    rmSync(tmp, { recursive: true, force: true });
  });

  test("create project → create resource → export → import", async () => {
    setupInitializedApp(tmp, isEsm);

    await CreateProject.run(["Main", "en", "fr"], CLI_ROOT);
    await CreateResource.run(["Main", "Messages"], CLI_ROOT);

    const resourcePath = join(tmp, "i18n", "resources", "Messages.msg.js");
    expect(readFileSync(resourcePath, "utf-8")).toContain(
      "messages: /** @type {const} */ (["
    );

    await Export.run([], CLI_ROOT);

    const xliffPath = join(tmp, "l10n", "xliff", "Main.xliff");
    expect(existsSync(xliffPath)).toBe(true);
    const xliff = readFileSync(xliffPath, "utf-8");
    expect(xliff).toContain("sampleKey");
    expect(xliff).toContain("sampleKey2");
    expect(xliff).toContain("Sample value.");
    expect(xliff).toContain("Hi, {name}");
    expect(xliff).toContain("The {name} parameter holds the user name.");

    writeFileSync(
      join(tmp, "l10n", "xliff", "Main.fr.xliff"),
      translateXliff(xliff, {
        "Sample value.": "Valeur d’exemple.",
        "Hi, {name}": "Salut, {name}",
      })
    );

    await ImportCmd.run([], CLI_ROOT);

    const jsonPath = join(tmp, "l10n", "translations", "Main", "fr", "Messages.json");
    expect(existsSync(jsonPath)).toBe(true);
    const translated = JSON.parse(readFileSync(jsonPath, "utf-8")) as {
      attributes: { lang: string };
      messages: { key: string; value: string }[];
    };
    expect(translated.attributes.lang).toBe("fr");
    expect(
      Object.fromEntries(translated.messages.map((m) => [m.key, m.value]))
    ).toMatchObject({
      sampleKey: "Valeur d’exemple.",
      sampleKey2: "Salut, {name}",
    });
  });
});
