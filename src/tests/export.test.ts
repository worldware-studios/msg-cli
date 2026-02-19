import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  symlinkSync,
  readdirSync,
  copyFileSync,
} from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import Export from "../commands/export.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_ROOT = join(__dirname, "..", "..");
const FIXTURES_MSG = join(__dirname, "fixtures", "msg-files");
const FIXTURES_INVALID = join(__dirname, "fixtures", "msg-files-invalid");

function setupPackageWithI18nAndL10n(tmp: string) {
  const pkg = {
    name: "test-app",
    version: "1.0.0",
    directories: { i18n: "i18n", l10n: "l10n", root: "." },
  };
  writeFileSync(join(tmp, "package.json"), JSON.stringify(pkg, null, 2));
  const resourcesDir = join(tmp, "i18n", "resources");
  const xliffDir = join(tmp, "l10n", "xliff");
  mkdirSync(resourcesDir, { recursive: true });
  mkdirSync(xliffDir, { recursive: true });
  return { resourcesDir, xliffDir };
}

/** Copy all .msg.* files from fixture dir into target resources dir, preserving structure. */
function copyMsgFixtures(fromDir: string, toResourcesDir: string) {
  const entries = readdirSync(fromDir, { withFileTypes: true });
  for (const entry of entries) {
    const src = join(fromDir, entry.name);
    const dest = join(toResourcesDir, entry.name);
    if (entry.isFile() && /\.msg\.(ts|js)$/i.test(entry.name)) {
      copyFileSync(src, dest);
    } else if (entry.isDirectory()) {
      mkdirSync(dest, { recursive: true });
      copyMsgFixtures(src, dest);
    }
  }
}

describe("Export command", () => {
  let tmp: string;
  let origCwd: string;

  beforeEach(() => {
    tmp = join(tmpdir(), `msg-export-cmd-${Date.now()}`);
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
    test("export -h or --help prints help and does not run export", async () => {
      setupPackageWithI18nAndL10n(tmp);
      try {
        await Export.run(["-h"], CLI_ROOT);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("EEXIT") && !msg.includes("Parsing --help")) throw err;
      }
      const xliffDir = join(tmp, "l10n", "xliff");
      const files = existsSync(xliffDir) ? readdirSync(xliffDir).filter((f) => f.endsWith(".xliff")) : [];
      expect(files).toHaveLength(0);
    });
  });

  describe("Happy path", () => {
    test("export all resources to XLIFF", async () => {
      const { resourcesDir, xliffDir } = setupPackageWithI18nAndL10n(tmp);
      copyMsgFixtures(FIXTURES_MSG, resourcesDir);
      writeFileSync(join(tmp, "tsconfig.json"), "{}");

      await Export.run([], CLI_ROOT);

      const files = readdirSync(xliffDir).filter((f) => f.endsWith(".xliff"));
      expect(files.length).toBeGreaterThanOrEqual(1);
      expect(files).toContain("test.xliff");
      const content = readFileSync(join(xliffDir, "test.xliff"), "utf-8");
      expect(content).toContain('xmlns="urn:oasis:names:tc:xliff:document:2.0"');
      expect(content).toContain('version="2.0"');
      expect(content).toContain("Hello");
      expect(content).toContain("World");
    });

    test("export filtered to single project", async () => {
      const { resourcesDir, xliffDir } = setupPackageWithI18nAndL10n(tmp);
      copyMsgFixtures(FIXTURES_MSG, resourcesDir);
      writeFileSync(join(tmp, "tsconfig.json"), "{}");

      await Export.run(["--project", "test"], CLI_ROOT);

      const files = readdirSync(xliffDir).filter((f) => f.endsWith(".xliff"));
      expect(files).toContain("test.xliff");
      const content = readFileSync(join(xliffDir, "test.xliff"), "utf-8");
      expect(content).toContain("Hello");
    });

    test("recursive discovery of resources in nested dirs", async () => {
      const { resourcesDir, xliffDir } = setupPackageWithI18nAndL10n(tmp);
      copyMsgFixtures(FIXTURES_MSG, resourcesDir);
      writeFileSync(join(tmp, "tsconfig.json"), "{}");

      await Export.run([], CLI_ROOT);

      const content = readFileSync(join(xliffDir, "test.xliff"), "utf-8");
      expect(content).toContain("Example");
      expect(content).toContain("Nested");
      expect(content).toContain("Deep");
    });
  });

  describe("Edge cases", () => {
    test("no MsgResource files found exits with message", async () => {
      setupPackageWithI18nAndL10n(tmp);
      const logSpy = vi.spyOn(Export.prototype, "log").mockImplementation(() => {});

      await Export.run([], CLI_ROOT);

      expect(logSpy).toHaveBeenCalledWith("No MsgResource files found. Nothing to export.");
      const xliffDir = join(tmp, "l10n", "xliff");
      const files = readdirSync(xliffDir).filter((f) => f.endsWith(".xliff"));
      expect(files).toHaveLength(0);
      logSpy.mockRestore();
    });

    test("--project with no matching resources exits with message", async () => {
      const { resourcesDir, xliffDir } = setupPackageWithI18nAndL10n(tmp);
      copyMsgFixtures(FIXTURES_MSG, resourcesDir);
      writeFileSync(join(tmp, "tsconfig.json"), "{}");
      writeFileSync(join(xliffDir, "other.xliff"), "<xliff/>");
      const logSpy = vi.spyOn(Export.prototype, "log").mockImplementation(() => {});

      await Export.run(["--project", "nonexistent"], CLI_ROOT);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("No resources found for project")
      );
      expect(existsSync(join(xliffDir, "other.xliff"))).toBe(true);
      logSpy.mockRestore();
    });

    test("l10n/xliff directory does not exist is created", async () => {
      const pkg = {
        name: "test-app",
        version: "1.0.0",
        directories: { i18n: "i18n", l10n: "l10n", root: "." },
      };
      writeFileSync(join(tmp, "package.json"), JSON.stringify(pkg, null, 2));
      mkdirSync(join(tmp, "i18n", "resources"), { recursive: true });
      copyMsgFixtures(FIXTURES_MSG, join(tmp, "i18n", "resources"));
      writeFileSync(join(tmp, "tsconfig.json"), "{}");
      const xliffDir = join(tmp, "l10n", "xliff");
      expect(existsSync(xliffDir)).toBe(false);

      await Export.run([], CLI_ROOT);

      expect(existsSync(xliffDir)).toBe(true);
      const files = readdirSync(xliffDir).filter((f) => f.endsWith(".xliff"));
      expect(files.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Errors", () => {
    test("invalid MsgResource file errors and does not write XLIFF", async () => {
      const { resourcesDir, xliffDir } = setupPackageWithI18nAndL10n(tmp);
      copyFileSync(
        join(FIXTURES_INVALID, "Invalid.msg.ts"),
        join(resourcesDir, "Invalid.msg.ts")
      );
      writeFileSync(join(tmp, "tsconfig.json"), "{}");

      await expect(Export.run([], CLI_ROOT)).rejects.toThrow(
        /Failed to import MsgResource|no valid export/
      );

      const files = readdirSync(xliffDir).filter((f) => f.endsWith(".xliff"));
      expect(files).toHaveLength(0);
    });

    test("when writeXliffFiles throws, command errors and reports failure", async () => {
      const { resourcesDir, xliffDir } = setupPackageWithI18nAndL10n(tmp);
      copyMsgFixtures(FIXTURES_MSG, resourcesDir);
      writeFileSync(join(tmp, "tsconfig.json"), "{}");

      const exportHelpers = await import("../lib/export-helpers.js");
      vi.spyOn(exportHelpers, "writeXliffFiles").mockRejectedValueOnce(
        new Error("EACCES: permission denied")
      );

      await expect(Export.run([], CLI_ROOT)).rejects.toThrow(
        /Could not write XLIFF files|EACCES|permission denied/
      );

      const files = existsSync(xliffDir)
        ? readdirSync(xliffDir).filter((f) => f.endsWith(".xliff"))
        : [];
      expect(files).toHaveLength(0);
      vi.restoreAllMocks();
    });

    test("i18n/resources directory missing exits with message", async () => {
      setupPackageWithI18nAndL10n(tmp);
      const warnSpy = vi.spyOn(Export.prototype, "warn").mockImplementation(() => {});
      rmSync(join(tmp, "i18n", "resources"), { recursive: true, force: true });
      mkdirSync(join(tmp, "i18n"), { recursive: true });

      await Export.run([], CLI_ROOT);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("i18n/resources directory does not exist")
      );
      warnSpy.mockRestore();
    });
  });
});
