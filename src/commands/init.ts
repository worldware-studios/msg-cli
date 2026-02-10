import { Command, Flags } from "@oclif/core";
import { spawnSync } from "child_process";
import { existsSync } from "fs";
import { createInterface } from "readline";
import { join } from "path";
import {
  DEFAULT_I18N_DIR,
  DEFAULT_L10N_DIR,
  type PackageJson,
  addDirectoriesToPackageJson,
  addImportAliasesToPackageJson,
  addScriptsToPackageJson,
  addTsconfigPaths,
  ensureDirectoriesWithGitkeep,
  findPackageJsonPath,
  isAlreadyInitialized,
  readPackageJson,
  validatePaths,
  writePackageJson,
} from "../lib/init-helpers.js";

/**
 * Scaffolds a msg project: directories, package.json entries, and dependencies.
 */
export default class Init extends Command {
  static override description =
    "Scaffold a msg project (i18n/l10n directories, package.json, and dependencies)";

  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --i18nDir lib/i18n --l10nDir data/l10n",
    "<%= config.bin %> <%= command.id %> -f",
  ];

  static override flags = {
    help: Flags.help({ char: "h" }),
    interactive: Flags.boolean({
      char: "i",
      description: "Prompt for i18n and l10n directory paths",
    }),
    force: Flags.boolean({
      char: "f",
      description: "Force clean install; overwrite existing msg setup",
    }),
    i18nDir: Flags.string({
      description: "Relative path for the i18n directory",
    }),
    l10nDir: Flags.string({
      description: "Relative path for the l10n directory",
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Init);

    const cwd = process.cwd();
    const pkgPath = findPackageJsonPath(cwd);
    if (!pkgPath) {
      this.error("package.json not found. Run this command from the project root.", {
        exit: 1,
      });
    }

    let i18nDir = flags.i18nDir ?? DEFAULT_I18N_DIR;
    let l10nDir = flags.l10nDir ?? DEFAULT_L10N_DIR;

    if (flags.interactive) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const ask = (question: string, defaultVal: string): Promise<string> =>
        new Promise((resolve) => {
          rl.question(`${question} [${defaultVal}]: `, (answer) => {
            resolve((answer?.trim() || defaultVal).trim() || defaultVal);
          });
        });
      if (!flags.i18nDir) {
        i18nDir = await ask("i18n directory path (relative to project root):", DEFAULT_I18N_DIR);
      }
      if (!flags.l10nDir) {
        l10nDir = await ask("l10n directory path (relative to project root):", DEFAULT_L10N_DIR);
      }
      rl.close();
    }

    const rootDir = join(cwd);
    const validation = validatePaths(rootDir, i18nDir, l10nDir);
    if (!validation.valid) {
      this.error(validation.error ?? "Invalid paths", { exit: 1 });
    }

    let pkg: PackageJson;
    try {
      pkg = readPackageJson(pkgPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Invalid or unreadable package.json";
      this.error(msg, { exit: 1 });
    }

    const alreadyInit = isAlreadyInitialized(pkg, rootDir, i18nDir, l10nDir);
    if (alreadyInit && !flags.force) {
      this.warn("Project appears already initialized for msg. Use -f or --force to re-run.");
      return;
    }

    this.log("Creating i18n and l10n directories...");
    try {
      ensureDirectoriesWithGitkeep(rootDir, i18nDir, l10nDir, flags.force);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create directories";
      this.error(msg, { exit: 1 });
    }

    this.log("Updating package.json...");
    pkg = addDirectoriesToPackageJson(pkg, i18nDir, l10nDir);
    pkg = addImportAliasesToPackageJson(pkg, i18nDir, l10nDir);
    pkg = addScriptsToPackageJson(pkg);
    try {
      writePackageJson(pkgPath, pkg);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to write package.json";
      this.error(msg, { exit: 1 });
    }

    const tsconfigPath = join(rootDir, "tsconfig.json");
    if (existsSync(tsconfigPath)) {
      this.log("Updating tsconfig.json for path aliases...");
      try {
        addTsconfigPaths(tsconfigPath, i18nDir, l10nDir);
      } catch (err) {
        this.warn(
          err instanceof Error ? err.message : "Could not update tsconfig.json; you may add paths manually."
        );
      }
    }

    this.log("Installing @worldware/msg...");
    const installResult = spawnSync(
      "npm",
      ["install", "@worldware/msg@latest", "--save"],
      { cwd: rootDir, shell: true, stdio: "inherit" }
    );
    if (installResult.status !== 0) {
      this.error("Failed to install @worldware/msg. Check your network and npm registry.", {
        exit: 1,
      });
    }

    this.log("Init complete.");
  }
}
