import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
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
import { setupInitializedApp, translateXliff } from "./e2e-helpers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_ROOT = join(__dirname, "..", "..");

/**
 * #49: the app lives under a directory named like a locale ("tmp"), as real
 * temp and system paths do (/tmp, /var/...). Export leaves the monolingual
 * l10n/xliff/Main.xliff in place and a translator's tool returns
 * l10n/xliff/fr/Main.xliff. Import must skip the first and read the locale
 * of the second from the directory under l10n/xliff, not from the parents.
 */
describe("import locale from l10n/xliff directories end to end (#49)", () => {
  let tmp: string;
  let root: string;
  let origCwd: string;
  let monolingualPath: string;

  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), "msg-locale-dir-e2e-"));
    mkdirSync(join(tmp, "tmp"));
    // Resolve symlinks (macOS /var -> /private/var) to match process.cwd().
    root = realpathSync(join(tmp, "tmp"));
    origCwd = process.cwd();
    process.chdir(root);
    symlinkSync(join(CLI_ROOT, "node_modules"), join(root, "node_modules"), "dir");

    setupInitializedApp(root, false);
    vi.spyOn(CreateProject.prototype, "log").mockImplementation(() => {});
    vi.spyOn(CreateResource.prototype, "log").mockImplementation(() => {});
    vi.spyOn(Export.prototype, "log").mockImplementation(() => {});
    await CreateProject.run(["Main", "en", "fr"], CLI_ROOT);
    await CreateResource.run(["Main", "Messages"], CLI_ROOT);
    await Export.run([], CLI_ROOT);

    monolingualPath = join(root, "l10n", "xliff", "Main.xliff");
    const xliff = readFileSync(monolingualPath, "utf-8");
    mkdirSync(join(root, "l10n", "xliff", "fr"));
    writeFileSync(
      join(root, "l10n", "xliff", "fr", "Main.xliff"),
      translateXliff(xliff, {
        "Sample value.": "Valeur d’exemple.",
        "Hi, {name}": "Salut, {name}",
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.chdir(origCwd);
    rmSync(tmp, { recursive: true, force: true });
  });

  function readFrenchMessages(): Record<string, string> {
    const jsonPath = join(root, "l10n", "translations", "Main", "fr", "Messages.json");
    expect(existsSync(jsonPath)).toBe(true);
    const translated = JSON.parse(readFileSync(jsonPath, "utf-8")) as {
      messages: { key: string; value: string }[];
    };
    return Object.fromEntries(translated.messages.map((m) => [m.key, m.value]));
  }

  test("export → translate into xliff/fr/ → import", async () => {
    vi.spyOn(ImportCmd.prototype, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(ImportCmd.prototype, "warn").mockImplementation(() => "");

    await ImportCmd.run([], CLI_ROOT);

    expect(warnSpy).toHaveBeenCalledWith(
      `Skipping monolingual file (no target locale): ${monolingualPath}`
    );
    expect(readFrenchMessages()).toMatchObject({
      sampleKey: "Valeur d’exemple.",
      sampleKey2: "Salut, {name}",
    });
    expect(existsSync(join(root, "l10n", "translations", "Main", "tmp"))).toBe(false);
  });

  test("--project and --language select the file by its xliff/fr/ directory", async () => {
    const logSpy = vi.spyOn(ImportCmd.prototype, "log").mockImplementation(() => {});

    await ImportCmd.run(["--project", "Main", "--language", "fr"], CLI_ROOT);

    expect(logSpy).toHaveBeenCalledWith("Filtered to language 'fr'.");
    expect(readFrenchMessages()).toMatchObject({ sampleKey: "Valeur d’exemple." });
  });
});

/**
 * #57: a file's trgLang, not its path, is its locale. A translator's tool
 * returns French (trgLang="fr") under a short directory that looks like a
 * locale code, and the same French file mislabeled with an "en" file name.
 */
describe("import uses trgLang as the locale end to end (#57)", () => {
  let tmp: string;
  let root: string;
  let origCwd: string;
  let french: string;

  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), "msg-trglang-e2e-"));
    // Resolve symlinks (macOS /var -> /private/var) to match process.cwd().
    root = realpathSync(tmp);
    origCwd = process.cwd();
    process.chdir(root);
    symlinkSync(join(CLI_ROOT, "node_modules"), join(root, "node_modules"), "dir");

    setupInitializedApp(root, false);
    vi.spyOn(CreateProject.prototype, "log").mockImplementation(() => {});
    vi.spyOn(CreateResource.prototype, "log").mockImplementation(() => {});
    vi.spyOn(Export.prototype, "log").mockImplementation(() => {});
    await CreateProject.run(["Main", "en", "fr"], CLI_ROOT);
    await CreateResource.run(["Main", "Messages"], CLI_ROOT);
    await Export.run([], CLI_ROOT);
    french = translateXliff(readFileSync(join(root, "l10n", "xliff", "Main.xliff"), "utf-8"), {
      "Sample value.": "Valeur d’exemple.",
    });
    vi.spyOn(ImportCmd.prototype, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.chdir(origCwd);
    rmSync(tmp, { recursive: true, force: true });
  });

  const translationsFor = (locale: string) => join(root, "l10n", "translations", "Main", locale);

  test("xliff/app/fr/Main.xliff imports as fr, not app", async () => {
    mkdirSync(join(root, "l10n", "xliff", "app", "fr"), { recursive: true });
    writeFileSync(join(root, "l10n", "xliff", "app", "fr", "Main.xliff"), french);

    await ImportCmd.run([], CLI_ROOT);

    expect(existsSync(join(translationsFor("fr"), "Messages.json"))).toBe(true);
    expect(existsSync(translationsFor("app"))).toBe(false);
  });

  test("Main.en.xliff containing French is skipped with a warning", async () => {
    const mislabeled = join(root, "l10n", "xliff", "Main.en.xliff");
    writeFileSync(mislabeled, french);
    const warnSpy = vi.spyOn(ImportCmd.prototype, "warn").mockImplementation(() => "");

    await ImportCmd.run([], CLI_ROOT);

    expect(warnSpy).toHaveBeenCalledWith(
      `Skipping ${mislabeled}: file name locale 'en' does not match trgLang 'fr'`
    );
    expect(existsSync(translationsFor("en"))).toBe(false);
    expect(existsSync(translationsFor("fr"))).toBe(false);
  });
});

/**
 * #68: a project whose name contains a dot. Export writes my.app.xliff; a
 * translator's tool fills it in place (trgLang="fr"). Import must read it as
 * project my.app, not as project "my" with locale "app".
 */
describe("dotted project name end to end (#68)", () => {
  let tmp: string;
  let root: string;
  let origCwd: string;

  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), "msg-dotted-e2e-"));
    // Resolve symlinks (macOS /var -> /private/var) to match process.cwd().
    root = realpathSync(tmp);
    origCwd = process.cwd();
    process.chdir(root);
    symlinkSync(join(CLI_ROOT, "node_modules"), join(root, "node_modules"), "dir");

    setupInitializedApp(root, false);
    vi.spyOn(CreateProject.prototype, "log").mockImplementation(() => {});
    vi.spyOn(CreateResource.prototype, "log").mockImplementation(() => {});
    vi.spyOn(Export.prototype, "log").mockImplementation(() => {});
    vi.spyOn(ImportCmd.prototype, "log").mockImplementation(() => {});
    await CreateProject.run(["my.app", "en", "fr"], CLI_ROOT);
    await CreateResource.run(["my.app", "Messages"], CLI_ROOT);
    await Export.run([], CLI_ROOT);

    const xliffPath = join(root, "l10n", "xliff", "my.app.xliff");
    writeFileSync(
      xliffPath,
      translateXliff(readFileSync(xliffPath, "utf-8"), { "Sample value.": "Valeur d’exemple." })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.chdir(origCwd);
    rmSync(tmp, { recursive: true, force: true });
  });

  test.each([[[]], [["--project", "my.app"]]])("export → translate in place → import %j", async (args) => {
    const warnSpy = vi.spyOn(ImportCmd.prototype, "warn").mockImplementation(() => "");

    await ImportCmd.run(args, CLI_ROOT);

    expect(warnSpy).not.toHaveBeenCalled();
    const jsonPath = join(root, "l10n", "translations", "my.app", "fr", "Messages.json");
    const messages = (JSON.parse(readFileSync(jsonPath, "utf-8")) as { messages: { key: string; value: string }[] })
      .messages;
    expect(messages.find((m) => m.key === "sampleKey")?.value).toBe("Valeur d’exemple.");
    expect(existsSync(join(root, "l10n", "translations", "my"))).toBe(false);
  });
});

/**
 * #69: a translator's tool fills the exported l10n/xliff/Main.xliff in place
 * (trgLang="fr"), so its path has no locale. --language fr must still select it.
 */
describe("--language selects by trgLang end to end (#69)", () => {
  let tmp: string;
  let root: string;
  let origCwd: string;

  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), "msg-language-e2e-"));
    // Resolve symlinks (macOS /var -> /private/var) to match process.cwd().
    root = realpathSync(tmp);
    origCwd = process.cwd();
    process.chdir(root);
    symlinkSync(join(CLI_ROOT, "node_modules"), join(root, "node_modules"), "dir");

    setupInitializedApp(root, false);
    vi.spyOn(CreateProject.prototype, "log").mockImplementation(() => {});
    vi.spyOn(CreateResource.prototype, "log").mockImplementation(() => {});
    vi.spyOn(Export.prototype, "log").mockImplementation(() => {});
    vi.spyOn(ImportCmd.prototype, "log").mockImplementation(() => {});
    await CreateProject.run(["Main", "en", "fr"], CLI_ROOT);
    await CreateResource.run(["Main", "Messages"], CLI_ROOT);
    await Export.run([], CLI_ROOT);
    const xliffPath = join(root, "l10n", "xliff", "Main.xliff");
    writeFileSync(
      xliffPath,
      translateXliff(readFileSync(xliffPath, "utf-8"), { "Sample value.": "Valeur d’exemple." })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.chdir(origCwd);
    rmSync(tmp, { recursive: true, force: true });
  });

  test("export → translate in place → import --language fr", async () => {
    await ImportCmd.run(["--language", "fr"], CLI_ROOT);
    expect(existsSync(join(root, "l10n", "translations", "Main", "fr", "Messages.json"))).toBe(true);
  });
});
