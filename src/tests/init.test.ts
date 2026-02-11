import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import * as childProcess from "child_process";
import type { PackageJson } from "../lib/init-helpers.js";
import Init from "../commands/init.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
/** Path to msg-cli project root so Config.load() finds oclif. */
const CLI_ROOT = join(__dirname, "..", "..");

let shouldThrowWritePackageJson = false;
let shouldThrowEnsureDirectories = false;
/** Answers to return for interactive prompts (i18n then l10n). Empty string = use default. */
let interactiveAnswers: string[] = [];

vi.mock("child_process", () => ({
  spawnSync: vi.fn(() => ({ status: 0 })),
}));

vi.mock("readline", () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn((_prompt: string, cb: (answer: string) => void) => {
      const answer = interactiveAnswers.shift() ?? "";
      cb(answer);
    }),
    close: vi.fn(),
  })),
}));

vi.mock("../lib/init-helpers.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/init-helpers.js")>();
  return {
    ...actual,
    writePackageJson: vi.fn((path: string, pkg: PackageJson) => {
      if (shouldThrowWritePackageJson) throw new Error("EACCES");
      return actual.writePackageJson(path, pkg);
    }),
    ensureDirectoriesWithGitkeep: vi.fn(
      (rootDir: string, i18nDir: string, l10nDir: string, force: boolean) => {
        if (shouldThrowEnsureDirectories) throw new Error("EACCES");
        return actual.ensureDirectoriesWithGitkeep(rootDir, i18nDir, l10nDir, force);
      }
    ),
  };
});

describe("Init command", () => {
  let tmp: string;
  let origCwd: string;

  beforeEach(() => {
    tmp = join(tmpdir(), `msg-init-cmd-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    origCwd = process.cwd();
    process.chdir(tmp);
  });

  afterEach(() => {
    shouldThrowWritePackageJson = false;
    shouldThrowEnsureDirectories = false;
    interactiveAnswers = [];
    process.chdir(origCwd);
    rmSync(tmp, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe("Help", () => {
    test("init -h or --help prints help and does not scaffold", async () => {
      writeFileSync(join(tmp, "package.json"), JSON.stringify({ name: "app" }));
      try {
        await Init.run(["-h"], CLI_ROOT);
      } catch (err: unknown) {
        // oclif throws EEXIT when showing help
        const message = err instanceof Error ? err.message : String(err);
        if (!message.includes("EEXIT") && !message.includes("Parsing --help")) throw err;
      }
      expect(existsSync(join(tmp, "src", "i18n"))).toBe(false);
      expect(existsSync(join(tmp, "res", "l10n"))).toBe(false);
      const pkg = JSON.parse(readFileSync(join(tmp, "package.json"), "utf-8"));
      expect(pkg.directories).toBeUndefined();
      expect(pkg.scripts?.["i18n-export"]).toBeUndefined();
    });
  });

  describe("Happy path", () => {
    test("fresh project with default paths creates dirs and updates package.json", async () => {
      writeFileSync(join(tmp, "package.json"), JSON.stringify({ name: "test-app", version: "1.0.0" }));

      await Init.run([], CLI_ROOT);

      expect(existsSync(join(tmp, "src", "i18n", "projects", ".gitkeep"))).toBe(true);
      expect(existsSync(join(tmp, "src", "i18n", "resources", ".gitkeep"))).toBe(true);
      expect(existsSync(join(tmp, "res", "l10n", "translations", ".gitkeep"))).toBe(true);
      expect(existsSync(join(tmp, "res", "l10n", "xliff", ".gitkeep"))).toBe(true);

      const pkg = JSON.parse(readFileSync(join(tmp, "package.json"), "utf-8"));
      expect(pkg.directories?.i18n).toBe("src/i18n");
      expect(pkg.directories?.l10n).toBe("res/l10n");
      expect(pkg.directories?.root).toBe(".");
      expect(pkg.imports?.["#i18n/*"]).toBe("./src/i18n/*");
      expect(pkg.imports?.["#l10n/*"]).toBe("./res/l10n/*");
      expect(pkg.imports?.["#root/*"]).toBe("./*");
      expect(pkg.scripts?.["i18n-export"]).toBe("msg export resources");
      expect(pkg.scripts?.["l10n-import"]).toBe("msg import translations");
    });

    test("custom --i18nDir and --l10nDir", async () => {
      writeFileSync(join(tmp, "package.json"), JSON.stringify({ name: "test-app" }));

      await Init.run(["--i18nDir", "lib/i18n", "--l10nDir", "data/l10n"], CLI_ROOT);

      expect(existsSync(join(tmp, "lib", "i18n", "projects", ".gitkeep"))).toBe(true);
      expect(existsSync(join(tmp, "data", "l10n", "xliff", ".gitkeep"))).toBe(true);
      const pkg = JSON.parse(readFileSync(join(tmp, "package.json"), "utf-8"));
      expect(pkg.directories?.i18n).toBe("lib/i18n");
      expect(pkg.directories?.l10n).toBe("data/l10n");
      expect(pkg.imports?.["#i18n/*"]).toBe("./lib/i18n/*");
      expect(pkg.imports?.["#l10n/*"]).toBe("./data/l10n/*");
    });

    test("updates tsconfig.json when present", async () => {
      writeFileSync(join(tmp, "package.json"), JSON.stringify({ name: "app" }));
      writeFileSync(
        join(tmp, "tsconfig.json"),
        JSON.stringify({ compilerOptions: {} })
      );

      await Init.run([], CLI_ROOT);

      const ts = JSON.parse(readFileSync(join(tmp, "tsconfig.json"), "utf-8"));
      expect(ts.compilerOptions?.baseUrl).toBe(".");
      expect(ts.compilerOptions?.paths?.["#i18n/*"]).toEqual(["./src/i18n/*"]);
      expect(ts.compilerOptions?.paths?.["#l10n/*"]).toEqual(["./res/l10n/*"]);
      expect(ts.compilerOptions?.paths?.["#root/*"]).toEqual(["./*"]);
    });
  });

  describe("Interactive", () => {
    test("-i with default answers uses default i18n and l10n paths", async () => {
      writeFileSync(join(tmp, "package.json"), JSON.stringify({ name: "app" }));
      interactiveAnswers = ["", ""];

      await Init.run(["-i"], CLI_ROOT);

      expect(existsSync(join(tmp, "src", "i18n", "projects", ".gitkeep"))).toBe(true);
      expect(existsSync(join(tmp, "res", "l10n", "xliff", ".gitkeep"))).toBe(true);
      const pkg = JSON.parse(readFileSync(join(tmp, "package.json"), "utf-8"));
      expect(pkg.directories?.i18n).toBe("src/i18n");
      expect(pkg.directories?.l10n).toBe("res/l10n");
    });

    test("-i with custom answers uses prompted i18n and l10n paths", async () => {
      writeFileSync(join(tmp, "package.json"), JSON.stringify({ name: "app" }));
      interactiveAnswers = ["lib/i18n", "data/l10n"];

      await Init.run(["-i"], CLI_ROOT);

      expect(existsSync(join(tmp, "lib", "i18n", "projects", ".gitkeep"))).toBe(true);
      expect(existsSync(join(tmp, "data", "l10n", "xliff", ".gitkeep"))).toBe(true);
      const pkg = JSON.parse(readFileSync(join(tmp, "package.json"), "utf-8"));
      expect(pkg.directories?.i18n).toBe("lib/i18n");
      expect(pkg.directories?.l10n).toBe("data/l10n");
      expect(pkg.imports?.["#i18n/*"]).toBe("./lib/i18n/*");
      expect(pkg.imports?.["#l10n/*"]).toBe("./data/l10n/*");
    });

    test("-i --i18nDir custom/i18n prompts only for l10n", async () => {
      writeFileSync(join(tmp, "package.json"), JSON.stringify({ name: "app" }));
      interactiveAnswers = ["locales/l10n"];

      await Init.run(["-i", "--i18nDir", "custom/i18n"], CLI_ROOT);

      expect(existsSync(join(tmp, "custom", "i18n", "projects", ".gitkeep"))).toBe(true);
      expect(existsSync(join(tmp, "locales", "l10n", "xliff", ".gitkeep"))).toBe(true);
      const pkg = JSON.parse(readFileSync(join(tmp, "package.json"), "utf-8"));
      expect(pkg.directories?.i18n).toBe("custom/i18n");
      expect(pkg.directories?.l10n).toBe("locales/l10n");
    });
  });

  describe("Edge cases", () => {
    test("already initialized without force logs warning and skips", async () => {
      writeFileSync(join(tmp, "package.json"), JSON.stringify({ name: "app" }));
      await Init.run([], CLI_ROOT);

      const pkgBefore = readFileSync(join(tmp, "package.json"), "utf-8");
      await Init.run([], CLI_ROOT);
      const pkgAfter = readFileSync(join(tmp, "package.json"), "utf-8");
      expect(pkgAfter).toBe(pkgBefore);
    });

    test("force re-runs and updates", async () => {
      writeFileSync(join(tmp, "package.json"), JSON.stringify({ name: "app" }));
      await Init.run([], CLI_ROOT);
      writeFileSync(join(tmp, "package.json"), JSON.stringify({ name: "app" }));
      await Init.run(["-f"], CLI_ROOT);
      const pkg = JSON.parse(readFileSync(join(tmp, "package.json"), "utf-8"));
      expect(pkg.directories?.i18n).toBe("src/i18n");
      expect(pkg.scripts?.["i18n-export"]).toBe("msg export resources");
    });

    test("empty or minimal package.json gets missing keys added", async () => {
      writeFileSync(join(tmp, "package.json"), "{}");

      await Init.run([], CLI_ROOT);

      const pkg = JSON.parse(readFileSync(join(tmp, "package.json"), "utf-8"));
      expect(pkg.directories).toBeDefined();
      expect(pkg.imports).toBeDefined();
      expect(pkg.scripts).toBeDefined();
      expect(pkg.scripts?.["i18n-export"]).toBe("msg export resources");
    });
  });

  describe("Errors", () => {
    test("no package.json fails with error", async () => {
      await expect(Init.run([], CLI_ROOT)).rejects.toThrow(/package\.json not found|Run this command from the project root/);
    });

    test("invalid package.json fails", async () => {
      writeFileSync(join(tmp, "package.json"), "{ invalid json");

      await expect(Init.run([], CLI_ROOT)).rejects.toThrow(/Invalid|package\.json/);
    });

    test("invalid --i18nDir fails", async () => {
      writeFileSync(join(tmp, "package.json"), JSON.stringify({ name: "app" }));

      await expect(Init.run(["--i18nDir", "/absolute/path"], CLI_ROOT)).rejects.toThrow(/relative|Invalid/);
    });

    test("when writePackageJson fails, command errors", async () => {
      writeFileSync(join(tmp, "package.json"), JSON.stringify({ name: "app" }));
      shouldThrowWritePackageJson = true;

      await expect(Init.run([], CLI_ROOT)).rejects.toThrow(/EACCES|Failed to write package\.json/);
    });

    test("when ensureDirectoriesWithGitkeep fails, command errors", async () => {
      writeFileSync(join(tmp, "package.json"), JSON.stringify({ name: "app" }));
      shouldThrowEnsureDirectories = true;

      await expect(Init.run([], CLI_ROOT)).rejects.toThrow(/EACCES|Failed to create directories/);
    });

    test("when tsconfig.json exists but is invalid, warns and completes", async () => {
      writeFileSync(join(tmp, "package.json"), JSON.stringify({ name: "app" }));
      writeFileSync(join(tmp, "tsconfig.json"), "{ invalid", "utf-8");

      await Init.run([], CLI_ROOT);

      const pkg = JSON.parse(readFileSync(join(tmp, "package.json"), "utf-8"));
      expect(pkg.directories?.i18n).toBe("src/i18n");
    });

    test("when npm install fails, command errors", async () => {
      writeFileSync(join(tmp, "package.json"), JSON.stringify({ name: "app" }));
      vi.mocked(childProcess.spawnSync).mockReturnValueOnce({
        status: 1,
        signal: null,
        output: [],
        pid: 0,
        stdout: Buffer.from(""),
        stderr: Buffer.from(""),
      });

      await expect(Init.run([], CLI_ROOT)).rejects.toThrow(/Failed to install @worldware\/msg/);
    });
  });
});
