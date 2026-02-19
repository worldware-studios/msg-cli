import { Args, Command, Flags } from "@oclif/core";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import {
  dynamicImportFromUrl,
  generateMsgResourceContent,
  importMsgProjectForResource,
  readPackageJsonForCreateResource,
  writeMsgResourceFile,
} from "../../lib/create-resource-helpers.js";
import { findPackageJsonPath } from "../../lib/init-helpers.js";

/**
 * Creates a new MsgResource file in the i18n resources directory.
 */
export default class CreateResource extends Command {
  static override description =
    "Create a new MsgResource file in the resources directory (i18n/resources)";

  static override strict = false;

  static override args = {
    projectName: Args.string({
      required: false,
      description: "Name of the project to import in the MsgResource file",
    }),
    title: Args.string({
      required: false,
      description: "Title of the resource and file name for the file",
    }),
  };

  static override flags = {
    help: Flags.help({ char: "h" }),
    force: Flags.boolean({
      char: "f",
      description: "Overwrite an existing resource file",
    }),
    edit: Flags.boolean({
      char: "e",
      description: "Open the file for editing after creation",
    }),
  };

  public async run(): Promise<void> {
    const { argv, flags } = await this.parse(CreateResource);
    const [projectName, title] = argv as string[];

    if (!projectName?.trim()) {
      this.error("projectName is required. Run 'msg init' first if you have not.", {
        exit: 1,
      });
    }
    if (!title?.trim()) {
      this.error("title is required.", { exit: 1 });
    }

    const cwd = process.cwd();
    const pkgPath = findPackageJsonPath(cwd);
    if (!pkgPath) {
      this.error("package.json not found. Run this command from the project root.", {
        exit: 1,
      });
    }

    let pkgInfo: ReturnType<typeof readPackageJsonForCreateResource>;
    try {
      pkgInfo = readPackageJsonForCreateResource(cwd);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.error(msg, { exit: 1 });
    }

    const rootDir = join(pkgPath, "..");
    const i18nDir = join(rootDir, pkgInfo.i18nDir);
    const projectsDir = join(i18nDir, "projects");
    const resourcesDir = join(i18nDir, "resources");

    if (!existsSync(i18nDir)) {
      this.error(
        `i18n directory '${pkgInfo.i18nDir}' does not exist. Run 'msg init' first.`,
        { exit: 1 }
      );
    }
    if (!existsSync(projectsDir)) {
      this.error(
        `i18n/projects directory does not exist. Run 'msg init' first.`,
        { exit: 1 }
      );
    }
    if (!existsSync(resourcesDir)) {
      this.error(
        `i18n/resources directory does not exist. Run 'msg init' first.`,
        { exit: 1 }
      );
    }

    const projectData = await importMsgProjectForResource(projectsDir, projectName.trim());
    if (!projectData) {
      this.error(
        `Project '${projectName}' not found or could not be loaded. Check i18n/projects for a matching file.`,
        { exit: 1 }
      );
    }

    const ext = ".js";
    const outPath = join(resourcesDir, `${title.trim()}.msg${ext}`);

    if (existsSync(outPath) && !flags.force) {
      this.error(
        `Resource file '${title.trim()}.msg${ext}' already exists. Use -f or --force to overwrite.`,
        { exit: 1 }
      );
    }

    const content = generateMsgResourceContent({
      title: title.trim(),
      projectName: projectName.trim(),
      sourceLocale: projectData.sourceLocale,
      dir: projectData.dir,
      isEsm: pkgInfo.isEsm || pkgInfo.useTypeScript,
    });

    try {
      writeMsgResourceFile(outPath, content);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.error(`Could not generate resource file: ${msg}`, { exit: 1 });
    }

    // Skip re-import verification under Vitest (dynamic import of file URLs fails in runner)
    if (process.env.VITEST !== "true") {
      try {
        const url = pathToFileURL(outPath).href;
        await dynamicImportFromUrl(url);
      } catch (err) {
        try {
          unlinkSync(outPath);
        } catch {
          // best-effort cleanup
        }
        const msg = err instanceof Error ? err.message : String(err);
        this.error(`Generated file is invalid or not importable: ${msg}`, { exit: 1 });
      }
    }

    this.log(`Created ${outPath}`);

    if (flags.edit) {
      const editor = process.env.VISUAL || process.env.EDITOR;
      if (editor) {
        const { spawn } = await import("child_process");
        spawn(editor, [outPath], { stdio: "inherit", detached: true });
      } else {
        this.warn("EDITOR or VISUAL not set. Open the file manually.");
      }
    }
  }
}
