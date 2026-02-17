import { Command, Flags } from "@oclif/core";
import { existsSync } from "fs";
import { join } from "path";
import { loadPackageJsonForMsg } from "../lib/init-helpers.js";
import {
  findMsgResourceFilePaths,
  importMsgResourcesFromPaths,
  groupResourcesByProject,
  filterResourceGroupsByProject,
  serializeResourceGroupsToXliff,
  writeXliffFiles,
} from "../lib/export-helpers.js";

/**
 * Serializes MsgResource objects to XLIFF 2.0 files in l10n/xliff on a per-project basis.
 */
export default class Export extends Command {
  static override description =
    "Serialize msg resources in i18n/resources to XLIFF 2.0 files in l10n/xliff (per project)";

  static override flags = {
    help: Flags.help({ char: "h" }),
    project: Flags.string({
      char: "p",
      description: "Filter the export to just the single named project",
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Export);
    const cwd = process.cwd();

    let ctx;
    try {
      ctx = loadPackageJsonForMsg(cwd, { requireL10n: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.error(msg, { exit: 1 });
    }

    const resourcesDir = join(ctx.rootDir, ctx.i18nDir, "resources");
    const xliffDir = join(ctx.rootDir, ctx.l10nDir ?? "l10n", "xliff");

    if (!existsSync(resourcesDir)) {
      this.warn(
        `i18n/resources directory does not exist at ${resourcesDir}. Run 'msg init' first.`
      );
      return;
    }

    this.log("Finding MsgResource files...");
    let filePaths: string[];
    try {
      filePaths = await findMsgResourceFilePaths(resourcesDir);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.error(`Could not read resources directory: ${msg}`, { exit: 1 });
    }

    if (filePaths.length === 0) {
      this.log("No MsgResource files found. Nothing to export.");
      return;
    }

    this.log(`Found ${filePaths.length} MsgResource file(s). Importing...`);
    let resources;
    try {
      resources = await importMsgResourcesFromPaths(filePaths);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.error(msg, { exit: 1 });
    }

    let groups = groupResourcesByProject(resources);
    this.log(`Grouped into ${groups.length} project(s).`);

    if (flags.project) {
      groups = filterResourceGroupsByProject(groups, flags.project);
      if (groups.length === 0) {
        this.log(`No resources found for project '${flags.project}'. Nothing to export.`);
        return;
      }
      this.log(`Filtered to project '${flags.project}'.`);
    }

    this.log("Serializing to XLIFF 2.0...");
    const xliffGroups = serializeResourceGroupsToXliff(groups);

    this.log(`Writing ${xliffGroups.length} XLIFF file(s) to ${xliffDir}...`);
    try {
      await writeXliffFiles(xliffDir, xliffGroups);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.error(`Could not write XLIFF files: ${msg}`, { exit: 1 });
    }

    for (const { project } of xliffGroups) {
      this.log(`  Wrote ${project}.xliff`);
    }
  }
}
