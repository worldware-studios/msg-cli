import { Command, Flags } from "@oclif/core";
import { existsSync } from "fs";
import { join } from "path";
import { loadPackageJsonForMsg } from "../lib/init-helpers.js";
import {
  findXliffFilePaths,
  filterXliffPathsByProject,
  filterXliffPathsByLocale,
  parseXliffFilename,
  processXliffFile,
  writeTranslationFiles,
} from "../lib/import-helpers.js";

/**
 * Imports translations from XLIFF 2.0 files into l10n/translations as JSON.
 */
export default class Import extends Command {
  static override description =
    "Import translations from XLIFF 2.0 files in l10n/xliff to JSON in l10n/translations";

  static override flags = {
    help: Flags.help({ char: "h" }),
    project: Flags.string({
      char: "p",
      description: "Filter import to the single named project",
    }),
    language: Flags.string({
      char: "l",
      description: "Filter import to the single locale",
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Import);
    const cwd = process.cwd();

    let ctx;
    try {
      ctx = loadPackageJsonForMsg(cwd, { requireL10n: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.error(msg, { exit: 1 });
    }

    const xliffDir = join(ctx.rootDir, ctx.l10nDir ?? "l10n", "xliff");
    const translationsDir = join(ctx.rootDir, ctx.l10nDir ?? "l10n", "translations");
    const projectsDir = join(ctx.rootDir, ctx.i18nDir, "projects");

    if (!existsSync(xliffDir)) {
      this.warn(
        `l10n/xliff directory does not exist at ${xliffDir}. Run 'msg init' first.`
      );
      return;
    }

    this.log("Finding XLIFF files...");
    let filePaths: string[];
    try {
      filePaths = await findXliffFilePaths(xliffDir);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.error(`Could not read xliff directory: ${msg}`, { exit: 1 });
    }

    if (filePaths.length === 0) {
      this.log("No XLIFF files found. Nothing to import.");
      return;
    }

    this.log(`Found ${filePaths.length} XLIFF file(s).`);

    if (flags.project) {
      filePaths = filterXliffPathsByProject(filePaths, flags.project);
      if (filePaths.length === 0) {
        this.log(`No XLIFF files found for project '${flags.project}'. Nothing to import.`);
        return;
      }
      this.log(`Filtered to project '${flags.project}'.`);
    }

    if (flags.language) {
      filePaths = filterXliffPathsByLocale(filePaths, flags.language);
      if (filePaths.length === 0) {
        this.log(`No XLIFF files found for language '${flags.language}'. Nothing to import.`);
        return;
      }
      this.log(`Filtered to language '${flags.language}'.`);
    }

    let wroteCount = 0;
    let errorCount = 0;

    for (const xliffPath of filePaths) {
      const { project: projectName, locale } = parseXliffFilename(xliffPath);
      if (!locale) {
        this.warn(`Skipping monolingual file (no target locale): ${xliffPath}`);
        continue;
      }

      try {
        const result = await processXliffFile(
          xliffPath,
          projectsDir,
          projectName,
          locale
        );
        if (result) {
          await writeTranslationFiles(translationsDir, result);
          for (const { title } of result.resources) {
            this.log(`  Wrote ${result.project}/${result.locale}/${title}.json`);
            wroteCount += 1;
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.error(`Failed to process ${xliffPath}: ${msg}`, { exit: 1 });
        errorCount += 1;
      }
    }

    if (wroteCount > 0) {
      this.log(`Imported ${wroteCount} translation file(s).`);
    } else if (errorCount === 0) {
      this.log("No translatable XLIFF files found (or all were monolingual / unsupported locale).");
    }
  }
}
