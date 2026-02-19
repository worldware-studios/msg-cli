import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  symlinkSync,
  copyFileSync,
} from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import ImportCmd from "../commands/import.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_ROOT = join(__dirname, "..", "..");
const FIXTURES_XLIFF = join(__dirname, "fixtures", "xliff");
const FIXTURES_PROJECTS = join(__dirname, "fixtures", "projects");

function setupPackageWithI18nAndL10n(tmp: string) {
  const pkg = {
    name: "test-app",
    version: "1.0.0",
    directories: { i18n: "i18n", l10n: "l10n", root: "." },
  };
  writeFileSync(join(tmp, "package.json"), JSON.stringify(pkg, null, 2));
  const xliffDir = join(tmp, "l10n", "xliff");
  const translationsDir = join(tmp, "l10n", "translations");
  const projectsDir = join(tmp, "i18n", "projects");
  mkdirSync(xliffDir, { recursive: true });
  mkdirSync(translationsDir, { recursive: true });
  mkdirSync(projectsDir, { recursive: true });
  return { xliffDir, translationsDir, projectsDir };
}

describe("Import command", () => {
  let tmp: string;
  let origCwd: string;

  beforeEach(() => {
    tmp = join(tmpdir(), `msg-import-cmd-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    origCwd = process.cwd();
    process.chdir(tmp);
    try {
      const target = join(CLI_ROOT, "node_modules");
      if (existsSync(target)) {
        const link = join(tmp, "node_modules");
        if (!existsSync(link)) symlinkSync(target, link, "dir");
      }
    } catch {
      // Skip symlink if sandbox
    }
  });

  afterEach(() => {
    process.chdir(origCwd);
    rmSync(tmp, { recursive: true, force: true });
  });

  describe("Help", () => {
    test("import -h or --help prints help and does not run import", async () => {
      setupPackageWithI18nAndL10n(tmp);
      try {
        await ImportCmd.run(["-h"], CLI_ROOT);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("EEXIT") && !msg.includes("Parsing --help")) throw err;
      }
      const translationsDir = join(tmp, "l10n", "translations");
      const testDir = join(translationsDir, "test", "zh");
      expect(existsSync(testDir)).toBe(false);
    });
  });

  describe("Happy path", () => {
    test("imports translations from XLIFF to JSON", async () => {
      const { xliffDir, translationsDir, projectsDir } =
        setupPackageWithI18nAndL10n(tmp);
      copyFileSync(
        join(FIXTURES_XLIFF, "test.zh.xliff"),
        join(xliffDir, "test.zh.xliff")
      );
      copyFileSync(
        join(FIXTURES_PROJECTS, "test.ts"),
        join(projectsDir, "test.ts")
      );
      writeFileSync(join(tmp, "tsconfig.json"), "{}");

      await ImportCmd.run([], CLI_ROOT);

      const outputPath = join(translationsDir, "test", "zh", "Example.json");
      expect(existsSync(outputPath)).toBe(true);
      const content = JSON.parse(readFileSync(outputPath, "utf-8"));
      expect(content.title).toBe("Example");
      expect(content.attributes.lang).toBe("zh");
      expect(content.messages).toHaveLength(2);
      expect(content.messages[0].value).toBe("你好");
      expect(content.messages[1].value).toBe("世界");
    });

    test("import filtered to single project", async () => {
      const { xliffDir, translationsDir, projectsDir } =
        setupPackageWithI18nAndL10n(tmp);
      copyFileSync(
        join(FIXTURES_XLIFF, "test.zh.xliff"),
        join(xliffDir, "test.zh.xliff")
      );
      copyFileSync(
        join(FIXTURES_PROJECTS, "test.ts"),
        join(projectsDir, "test.ts")
      );
      writeFileSync(join(tmp, "tsconfig.json"), "{}");

      await ImportCmd.run(["--project", "test"], CLI_ROOT);

      const outputPath = join(translationsDir, "test", "zh", "Example.json");
      expect(existsSync(outputPath)).toBe(true);
    });

    test("import filtered to single language", async () => {
      const { xliffDir, translationsDir, projectsDir } =
        setupPackageWithI18nAndL10n(tmp);
      copyFileSync(
        join(FIXTURES_XLIFF, "test.zh.xliff"),
        join(xliffDir, "test.zh.xliff")
      );
      copyFileSync(
        join(FIXTURES_PROJECTS, "test.ts"),
        join(projectsDir, "test.ts")
      );
      writeFileSync(join(tmp, "tsconfig.json"), "{}");

      await ImportCmd.run(["--language", "zh"], CLI_ROOT);

      const outputPath = join(translationsDir, "test", "zh", "Example.json");
      expect(existsSync(outputPath)).toBe(true);
    });
  });

  describe("Edge cases", () => {
    test("no XLIFF files found exits with message", async () => {
      setupPackageWithI18nAndL10n(tmp);
      const logSpy = vi.spyOn(ImportCmd.prototype, "log").mockImplementation(() => {});

      await ImportCmd.run([], CLI_ROOT);

      expect(logSpy).toHaveBeenCalledWith("No XLIFF files found. Nothing to import.");
      const translationsDir = join(tmp, "l10n", "translations");
      expect(existsSync(translationsDir)).toBe(true);
      const testDir = join(translationsDir, "test");
      expect(existsSync(testDir)).toBe(false);
      logSpy.mockRestore();
    });

    test("--project with no matching files exits with message", async () => {
      const { xliffDir, projectsDir } = setupPackageWithI18nAndL10n(tmp);
      copyFileSync(
        join(FIXTURES_XLIFF, "test.zh.xliff"),
        join(xliffDir, "test.zh.xliff")
      );
      copyFileSync(
        join(FIXTURES_PROJECTS, "test.ts"),
        join(projectsDir, "test.ts")
      );
      writeFileSync(join(tmp, "tsconfig.json"), "{}");
      const logSpy = vi.spyOn(ImportCmd.prototype, "log").mockImplementation(() => {});

      await ImportCmd.run(["--project", "nonexistent"], CLI_ROOT);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("No XLIFF files found for project")
      );
      logSpy.mockRestore();
    });

    test("skips monolingual files (no locale in filename)", async () => {
      const { xliffDir, translationsDir, projectsDir } =
        setupPackageWithI18nAndL10n(tmp);
      const monolingual = `<?xml version="1.0" encoding="UTF-8"?>
<xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" version="2.0" srcLang="en">
  <file id="f1" original="Example.json">
    <unit id="u1" name="hello">
      <segment><source>Hello</source></segment>
    </unit>
  </file>
</xliff>`;
      writeFileSync(join(xliffDir, "test.xliff"), monolingual);
      copyFileSync(
        join(FIXTURES_PROJECTS, "test.ts"),
        join(projectsDir, "test.ts")
      );
      writeFileSync(join(tmp, "tsconfig.json"), "{}");
      const logSpy = vi.spyOn(ImportCmd.prototype, "log").mockImplementation(() => {});

      await ImportCmd.run([], CLI_ROOT);

      expect(logSpy).toHaveBeenCalledWith(
        "No translatable XLIFF files found (or all were monolingual / unsupported locale)."
      );
      const outputPath = join(translationsDir, "test", "zh", "Example.json");
      expect(existsSync(outputPath)).toBe(false);
      logSpy.mockRestore();
    });

    test("skips XLIFF when locale not in project targetLocales (processXliffFile returns null)", async () => {
      const { xliffDir, translationsDir, projectsDir } =
        setupPackageWithI18nAndL10n(tmp);
      const esXliff = `<?xml version="1.0" encoding="UTF-8"?>
<xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" version="2.0" srcLang="en" trgLang="es">
  <file id="f1" original="Example.json">
    <unit id="u1" name="hello">
      <segment><source>Hello</source><target>Hola</target></segment>
    </unit>
  </file>
</xliff>`;
      writeFileSync(join(xliffDir, "test.es.xliff"), esXliff);
      copyFileSync(
        join(FIXTURES_PROJECTS, "test.ts"),
        join(projectsDir, "test.ts")
      );
      writeFileSync(join(tmp, "tsconfig.json"), "{}");
      const logSpy = vi.spyOn(ImportCmd.prototype, "log").mockImplementation(() => {});

      await ImportCmd.run([], CLI_ROOT);

      expect(logSpy).toHaveBeenCalledWith(
        "No translatable XLIFF files found (or all were monolingual / unsupported locale)."
      );
      expect(existsSync(join(translationsDir, "test", "es"))).toBe(false);
      logSpy.mockRestore();
    });

    test("skips XLIFF when project file does not exist (processXliffFile returns null)", async () => {
      const { xliffDir, translationsDir } = setupPackageWithI18nAndL10n(tmp);
      copyFileSync(
        join(FIXTURES_XLIFF, "test.zh.xliff"),
        join(xliffDir, "nonexistent.zh.xliff")
      );
      writeFileSync(join(tmp, "tsconfig.json"), "{}");
      const logSpy = vi.spyOn(ImportCmd.prototype, "log").mockImplementation(() => {});

      await ImportCmd.run([], CLI_ROOT);

      expect(logSpy).toHaveBeenCalledWith(
        "No translatable XLIFF files found (or all were monolingual / unsupported locale)."
      );
      expect(existsSync(join(translationsDir, "nonexistent"))).toBe(false);
      logSpy.mockRestore();
    });

    test("l10n/xliff directory does not exist exits with warning", async () => {
      const pkg = {
        name: "test-app",
        version: "1.0.0",
        directories: { i18n: "i18n", l10n: "l10n", root: "." },
      };
      writeFileSync(join(tmp, "package.json"), JSON.stringify(pkg, null, 2));
      mkdirSync(join(tmp, "i18n", "projects"), { recursive: true });
      const warnSpy = vi.spyOn(ImportCmd.prototype, "warn").mockImplementation(() => {});

      await ImportCmd.run([], CLI_ROOT);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("l10n/xliff directory does not exist")
      );
      warnSpy.mockRestore();
    });
  });

  describe("Errors", () => {
    test("malformed XLIFF errors", async () => {
      const { xliffDir, projectsDir } = setupPackageWithI18nAndL10n(tmp);
      copyFileSync(
        join(FIXTURES_XLIFF, "invalid.xliff"),
        join(xliffDir, "test.zh.xliff")
      );
      copyFileSync(
        join(FIXTURES_PROJECTS, "test.ts"),
        join(projectsDir, "test.ts")
      );
      writeFileSync(join(tmp, "tsconfig.json"), "{}");

      await expect(ImportCmd.run([], CLI_ROOT)).rejects.toThrow(
        /Failed to process|Malformed|parse/
      );
    });
  });
});
