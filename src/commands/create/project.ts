import { Args, Command, Flags } from "@oclif/core";
import { existsSync } from "fs";
import { join } from "path";
import {
  calculateRelativePath,
  importMsgProjectFile,
  loadPackageJsonForCreateProject,
  writeMsgProjectFile,
} from "../../lib/create-project-helpers.js";
import { findPackageJsonPath } from "../../lib/init-helpers.js";

/**
 * Creates a new MsgProject file in the i18n projects directory.
 */
export default class CreateProject extends Command {
  static override description =
    "Create a new MsgProject file in the projects directory (i18n/projects)";

  static override strict = false;

  static override args = {
    projectName: Args.string({
      required: false,
      description: "Name of the project (used as file name)",
    }),
    source: Args.string({
      required: false,
      description: "Source locale for the project",
    }),
    targets: Args.string({
      required: false,
      description: "Target locale(s) (variadic)",
    }),
  };

  static override flags = {
    help: Flags.help({ char: "h" }),
    extend: Flags.string({
      char: "e",
      description: "Extend an existing project",
    }),
  };

  public async run(): Promise<void> {
    const { argv, flags } = await this.parse(CreateProject);
    const [projectName, source, ...targets] = argv as string[];

    if (!projectName?.trim()) {
      this.error("projectName is required.", { exit: 1 });
    }
    const useExtend = Boolean(flags.extend?.trim());
    if (!useExtend) {
      if (!source?.trim()) {
        this.error("source locale is required.", { exit: 1 });
      }
      if (!targets?.length || targets.every((t) => !t?.trim())) {
        this.error("At least one target locale is required.", { exit: 1 });
      }
    }

    const cwd = process.cwd();
    const pkgPath = findPackageJsonPath(cwd);
    if (!pkgPath) {
      this.error("package.json not found. Run this command from the project root.", { exit: 1 });
    }

    let pkg: ReturnType<typeof loadPackageJsonForCreateProject>;
    try {
      pkg = loadPackageJsonForCreateProject(cwd);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.error(msg, { exit: 1 });
    }

    const rootDir = join(pkgPath, "..");
    const i18nDir = pkg.directories.i18n;
    const l10nDir = pkg.directories.l10n;
    const projectsDir = join(rootDir, i18nDir, "projects");
    const translationsDir = join(rootDir, l10nDir, "translations");

    const relPath = calculateRelativePath(projectsDir, translationsDir);
    const useTypeScript = existsSync(join(rootDir, "tsconfig.json"));
    const isEsm = (pkg as { type?: string }).type === "module";
    const ext = useTypeScript ? ".ts" : ".js";
    const outPath = join(projectsDir, `${projectName}${ext}`);

    if (existsSync(outPath)) {
      this.error(`A project with the name '${projectName}' already exists.`, { exit: 1 });
    }

    let targetLocales: Record<string, string[]> = {};
    let pseudoLocale = "en-XA";
    let resolvedSource = source?.trim();
    const hasUserSourceAndTargets = Boolean(resolvedSource && targets?.length && targets.some((t) => t?.trim()));

    if (flags.extend) {
      const base = await importMsgProjectFile(projectsDir, flags.extend);
      if (!base) {
        this.error(`Project '${flags.extend}' could not be found to extend.`, { exit: 1 });
      }
      if (base.locales?.targetLocales && typeof base.locales.targetLocales === "object") {
        targetLocales = { ...base.locales.targetLocales };
      }
      if (base.locales?.pseudoLocale) {
        pseudoLocale = base.locales.pseudoLocale;
      }
      if (!hasUserSourceAndTargets) {
        resolvedSource = base.locales?.sourceLocale ?? "";
        if (!resolvedSource) {
          this.error("Base project has no sourceLocale. Provide source and targets explicitly.", { exit: 1 });
        }
      }
    }

    if (hasUserSourceAndTargets) {
      targetLocales[resolvedSource!] = [resolvedSource!];
      for (const t of targets) {
        if (t?.trim()) targetLocales[t.trim()] = [t.trim()];
      }
    }

    const loaderPathLine =
      "const path = `${TRANSLATION_IMPORT_PATH}/${project}/${language}/${title}.json`;";
    const loaderWarnLine =
      "console.warn(`Translations for locale ${language} could not be loaded.`, error);";
    const loaderBody = `${loaderPathLine}
  try {
    const module = await import(path, { with: { type: 'json' } });
    return module.default;
  } catch (error) {
    ${loaderWarnLine}
    return {
      title,
      attributes: { lang: language, dir: '' },
      notes: [],
      messages: []
    };
  }`;

    const importPath = relPath.replace(/\\/g, "/");
    const content = isEsm
      ? `import { MsgProject } from '@worldware/msg';

const TRANSLATION_IMPORT_PATH = ${JSON.stringify(importPath)};
const loader = async (project, title, language) => {
  ${loaderBody}
};

export default MsgProject.create({
  project: { name: ${JSON.stringify(projectName)}, version: 1 },
  locales: {
    sourceLocale: ${JSON.stringify(resolvedSource)},
    pseudoLocale: ${JSON.stringify(pseudoLocale)},
    targetLocales: ${JSON.stringify(targetLocales)}
  },
  loader
});
`
      : `const { MsgProject } = require('@worldware/msg');

const TRANSLATION_IMPORT_PATH = ${JSON.stringify(importPath)};
const loader = async (project, title, language) => {
  ${loaderBody}
};

module.exports = MsgProject.create({
  project: { name: ${JSON.stringify(projectName)}, version: 1 },
  locales: {
    sourceLocale: ${JSON.stringify(resolvedSource)},
    pseudoLocale: ${JSON.stringify(pseudoLocale)},
    targetLocales: ${JSON.stringify(targetLocales)}
  },
  loader
});
`;

    this.log("Creating MsgProject file...");
    writeMsgProjectFile(outPath, content);
    this.log(`Created ${outPath}`);
  }
}
