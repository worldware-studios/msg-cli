import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
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

    test("imports NONE/MF1/MF2 formats and MF1 PGS plurals from XLIFF 2.2", async () => {
      const { xliffDir, translationsDir, projectsDir } =
        setupPackageWithI18nAndL10n(tmp);
      copyFileSync(
        join(FIXTURES_XLIFF, "formats.zh.xliff"),
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
      const byKey = Object.fromEntries(
        content.messages.map((m: { key: string }) => [m.key, m])
      );
      expect(byKey.raw.attributes.format).toBe("NONE");
      expect(byKey.raw.value).toBe("字面 {x}");
      expect(byKey.files.attributes.format).toBe("MF1");
      expect(byKey.files.value).toMatch(/\{count,\s*plural,/);
      expect(byKey.files.value).toContain("# 个文件");
      expect(
        byKey.hello.attributes?.format === "MF2" ||
          byKey.hello.attributes?.format === undefined
      ).toBe(true);
      expect(byKey.hello.value).toBe("你好 {$name}");
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

    test("--project does not select other projects that share its prefix (#56)", async () => {
      const { xliffDir, translationsDir, projectsDir } = setupPackageWithI18nAndL10n(tmp);
      for (const name of ["test", "testing"]) {
        copyFileSync(join(FIXTURES_XLIFF, "test.zh.xliff"), join(xliffDir, `${name}.zh.xliff`));
        copyFileSync(join(FIXTURES_PROJECTS, "test.ts"), join(projectsDir, `${name}.ts`));
      }
      writeFileSync(join(tmp, "tsconfig.json"), "{}");
      vi.spyOn(ImportCmd.prototype, "log").mockImplementation(() => {});

      await ImportCmd.run(["--project", "test"], CLI_ROOT);

      expect(existsSync(join(translationsDir, "test", "zh", "Example.json"))).toBe(true);
      expect(existsSync(join(translationsDir, "testing"))).toBe(false);
      vi.restoreAllMocks();
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

    test("--language selects by trgLang, not the path (#69)", async () => {
      const { xliffDir, translationsDir, projectsDir } = setupPackageWithI18nAndL10n(tmp);
      const zh = readFileSync(join(FIXTURES_XLIFF, "test.zh.xliff"), "utf-8");
      // Bilingual zh with no locale in its path: selected.
      writeFileSync(join(xliffDir, "test.xliff"), zh);
      // A zh/ directory holding a German file: not selected.
      mkdirSync(join(xliffDir, "zh"));
      writeFileSync(
        join(xliffDir, "zh", "other.xliff"),
        zh.replace('trgLang="zh"', 'trgLang="de"').replace('original="Example.json"', 'original="Other.json"')
      );
      copyFileSync(join(FIXTURES_PROJECTS, "test.ts"), join(projectsDir, "test.ts"));
      copyFileSync(join(FIXTURES_PROJECTS, "test.ts"), join(projectsDir, "other.ts"));
      writeFileSync(join(tmp, "tsconfig.json"), "{}");
      const logSpy = vi.spyOn(ImportCmd.prototype, "log").mockImplementation(() => {});

      await ImportCmd.run(["--language", "zh"], CLI_ROOT);

      expect(existsSync(join(translationsDir, "test", "zh", "Example.json"))).toBe(true);
      expect(existsSync(join(translationsDir, "other"))).toBe(false);
      logSpy.mockRestore();
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

    test("--language with no matching files exits with message", async () => {
      const { xliffDir } = setupPackageWithI18nAndL10n(tmp);
      copyFileSync(join(FIXTURES_XLIFF, "test.zh.xliff"), join(xliffDir, "test.zh.xliff"));
      const logSpy = vi.spyOn(ImportCmd.prototype, "log").mockImplementation(() => {});

      await ImportCmd.run(["--language", "fr"], CLI_ROOT);

      expect(logSpy).toHaveBeenCalledWith(
        "No XLIFF files found for language 'fr'. Nothing to import."
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

    test("skips monolingual file as monolingual under a locale-shaped parent directory (#49)", async () => {
      // Real temp paths like /var/folders/... used to make "var" the locale.
      // Nest the package under "var" ourselves so this holds on every OS.
      mkdirSync(join(tmp, "var"), { recursive: true });
      // Resolve symlinks (macOS /var -> /private/var) so the expected path
      // matches what the command derives from process.cwd().
      const root = realpathSync(join(tmp, "var"));
      process.chdir(root);
      const { xliffDir, translationsDir, projectsDir } =
        setupPackageWithI18nAndL10n(root);
      const monolingual = `<?xml version="1.0" encoding="UTF-8"?>
<xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" version="2.0" srcLang="en">
  <file id="f1" original="Example.json">
    <unit id="u1" name="hello">
      <segment><source>Hello</source></segment>
    </unit>
  </file>
</xliff>`;
      const xliffPath = join(xliffDir, "test.xliff");
      writeFileSync(xliffPath, monolingual);
      copyFileSync(
        join(FIXTURES_PROJECTS, "test.ts"),
        join(projectsDir, "test.ts")
      );
      writeFileSync(join(root, "tsconfig.json"), "{}");
      const logSpy = vi.spyOn(ImportCmd.prototype, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(ImportCmd.prototype, "warn").mockImplementation(() => "");

      await ImportCmd.run([], CLI_ROOT);

      expect(warnSpy).toHaveBeenCalledWith(
        `Skipping monolingual file (no target locale): ${xliffPath}`
      );
      expect(existsSync(join(translationsDir, "test"))).toBe(false);
      logSpy.mockRestore();
      warnSpy.mockRestore();
    });

    test("imports locale from a directory under l10n/xliff (xliff/zh/test.xliff) (#49)", async () => {
      const { xliffDir, translationsDir, projectsDir } =
        setupPackageWithI18nAndL10n(tmp);
      mkdirSync(join(xliffDir, "zh"), { recursive: true });
      copyFileSync(
        join(FIXTURES_XLIFF, "test.zh.xliff"),
        join(xliffDir, "zh", "test.xliff")
      );
      copyFileSync(
        join(FIXTURES_PROJECTS, "test.ts"),
        join(projectsDir, "test.ts")
      );
      writeFileSync(join(tmp, "tsconfig.json"), "{}");
      const logSpy = vi.spyOn(ImportCmd.prototype, "log").mockImplementation(() => {});

      await ImportCmd.run([], CLI_ROOT);

      expect(existsSync(join(translationsDir, "test", "zh"))).toBe(true);
      logSpy.mockRestore();
    });

    describe("two sources for one translation file (#71)", () => {
      afterEach(() => vi.restoreAllMocks());

      test("warns naming both XLIFF files, keeps the later one, and counts it once", async () => {
        const { xliffDir, translationsDir, projectsDir } = setupPackageWithI18nAndL10n(tmp);
        const zh = readFileSync(join(FIXTURES_XLIFF, "test.zh.xliff"), "utf-8");
        // Paths are processed sorted: test.zh.xliff, then zh/test.xliff.
        writeFileSync(join(xliffDir, "test.zh.xliff"), zh);
        mkdirSync(join(xliffDir, "zh"));
        writeFileSync(join(xliffDir, "zh", "test.xliff"), zh.replace("<target>你好</target>", "<target>您好</target>"));
        copyFileSync(join(FIXTURES_PROJECTS, "test.ts"), join(projectsDir, "test.ts"));
        writeFileSync(join(tmp, "tsconfig.json"), "{}");
        const logSpy = vi.spyOn(ImportCmd.prototype, "log").mockImplementation(() => {});
        const warnSpy = vi.spyOn(ImportCmd.prototype, "warn").mockImplementation(() => "");

        await ImportCmd.run([], CLI_ROOT);

        const root = realpathSync(xliffDir);
        expect(warnSpy).toHaveBeenCalledWith(
          `${join("test", "zh", "Example.json")} from ${join(root, "zh", "test.xliff")} overwrites the one from ${join(root, "test.zh.xliff")}`
        );
        expect(logSpy).toHaveBeenCalledWith("Imported 1 translation file(s).");
        expect(readFileSync(join(translationsDir, "test", "zh", "Example.json"), "utf-8")).toContain("您好");
      });

      test("warns when one XLIFF file has two <file> elements with the same original", async () => {
        const { xliffDir, projectsDir } = setupPackageWithI18nAndL10n(tmp);
        const xliffPath = join(xliffDir, "test.zh.xliff");
        writeFileSync(
          xliffPath,
          `<?xml version="1.0"?><xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" version="2.0" srcLang="en" trgLang="zh">` +
            `<file id="f1" original="A.json"><unit id="u1" name="a"><segment><source>A</source><target>甲</target></segment></unit></file>` +
            `<file id="f2" original="A.json"><unit id="u1" name="a"><segment><source>A</source><target>乙</target></segment></unit></file></xliff>`
        );
        copyFileSync(join(FIXTURES_PROJECTS, "test.ts"), join(projectsDir, "test.ts"));
        writeFileSync(join(tmp, "tsconfig.json"), "{}");
        const logSpy = vi.spyOn(ImportCmd.prototype, "log").mockImplementation(() => {});
        const warnSpy = vi.spyOn(ImportCmd.prototype, "warn").mockImplementation(() => "");

        await ImportCmd.run([], CLI_ROOT);

        expect(warnSpy).toHaveBeenCalledWith(
          `${join("test", "zh", "A.json")} appears more than once in ${realpathSync(xliffPath)}; the last one is kept`
        );
        expect(logSpy).toHaveBeenCalledWith("Imported 1 translation file(s).");
      });
    });

    describe("dotted project names (#68)", () => {
      /** Projects my and my.app; a bilingual zh file named my.app.xliff. */
      function setupDotted() {
        const dirs = setupPackageWithI18nAndL10n(tmp);
        for (const name of ["my", "my.app"]) {
          copyFileSync(join(FIXTURES_PROJECTS, "test.ts"), join(dirs.projectsDir, `${name}.ts`));
        }
        copyFileSync(join(FIXTURES_XLIFF, "test.zh.xliff"), join(dirs.xliffDir, "my.app.xliff"));
        writeFileSync(join(tmp, "tsconfig.json"), "{}");
        vi.spyOn(ImportCmd.prototype, "log").mockImplementation(() => {});
        vi.spyOn(ImportCmd.prototype, "warn").mockImplementation(() => "");
        return dirs;
      }
      afterEach(() => vi.restoreAllMocks());

      test("imports my.app.xliff as project my.app", async () => {
        const { translationsDir } = setupDotted();
        await ImportCmd.run([], CLI_ROOT);
        expect(existsSync(join(translationsDir, "my.app", "zh", "Example.json"))).toBe(true);
        expect(existsSync(join(translationsDir, "my"))).toBe(false);
      });

      test("--project my.app selects my.app.xliff", async () => {
        const { translationsDir } = setupDotted();
        await ImportCmd.run(["--project", "my.app"], CLI_ROOT);
        expect(existsSync(join(translationsDir, "my.app", "zh", "Example.json"))).toBe(true);
      });

      test("--project my does not import my.app.xliff once it resolves to my.app", async () => {
        const { translationsDir } = setupDotted();
        await ImportCmd.run(["--project", "my"], CLI_ROOT);
        expect(existsSync(join(translationsDir, "my.app"))).toBe(false);
        expect(existsSync(join(translationsDir, "my"))).toBe(false);
      });
    });

    describe("trgLang is the file's locale (#57)", () => {
      /** Writes the zh fixture (trgLang="zh") at `relPath` under l10n/xliff and runs import. */
      async function importFixtureAt(relPath: string[]) {
        const { xliffDir, translationsDir, projectsDir } = setupPackageWithI18nAndL10n(tmp);
        const xliffPath = join(xliffDir, ...relPath);
        mkdirSync(dirname(xliffPath), { recursive: true });
        copyFileSync(join(FIXTURES_XLIFF, "test.zh.xliff"), xliffPath);
        copyFileSync(join(FIXTURES_PROJECTS, "test.ts"), join(projectsDir, "test.ts"));
        writeFileSync(join(tmp, "tsconfig.json"), "{}");
        const logSpy = vi.spyOn(ImportCmd.prototype, "log").mockImplementation(() => {});
        const warnSpy = vi.spyOn(ImportCmd.prototype, "warn").mockImplementation(() => "");
        await ImportCmd.run([], CLI_ROOT);
        const warnings = warnSpy.mock.calls.map((c) => c[0]);
        logSpy.mockRestore();
        warnSpy.mockRestore();
        // The command derives paths from process.cwd(), which resolves symlinks (macOS /var).
        return { xliffPath: realpathSync(xliffPath), translationsDir, warnings };
      }

      test("skips and warns when the file name locale disagrees with trgLang", async () => {
        const { xliffPath, translationsDir, warnings } = await importFixtureAt(["test.en.xliff"]);
        expect(warnings).toContain(`Skipping ${xliffPath}: file name locale 'en' does not match trgLang 'zh'`);
        expect(existsSync(join(translationsDir, "test"))).toBe(false);
      });

      test("imports a bilingual file with no locale in its path, using trgLang", async () => {
        const { translationsDir, warnings } = await importFixtureAt(["test.xliff"]);
        expect(warnings).toEqual([]);
        expect(existsSync(join(translationsDir, "test", "zh"))).toBe(true);
      });

      test("uses trgLang, not a short directory name, as the locale (xliff/app/zh/test.xliff)", async () => {
        const { translationsDir } = await importFixtureAt(["app", "zh", "test.xliff"]);
        expect(existsSync(join(translationsDir, "test", "zh"))).toBe(true);
        expect(existsSync(join(translationsDir, "test", "app"))).toBe(false);
      });
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
      const warnSpy = vi.spyOn(ImportCmd.prototype, "warn").mockImplementation((input) => input);

      await ImportCmd.run([], CLI_ROOT);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("l10n/xliff directory does not exist")
      );
      warnSpy.mockRestore();
    });
  });

  describe("Errors", () => {
    test("missing package.json errors", async () => {
      await expect(ImportCmd.run([], CLI_ROOT)).rejects.toThrow(/package\.json/);
    });

    test("l10n/xliff that is a file, not a directory, errors", async () => {
      const { xliffDir } = setupPackageWithI18nAndL10n(tmp);
      rmSync(xliffDir, { recursive: true, force: true });
      writeFileSync(xliffDir, "not a directory");

      await expect(ImportCmd.run([], CLI_ROOT)).rejects.toThrow(
        /Could not read xliff directory/
      );
    });

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
