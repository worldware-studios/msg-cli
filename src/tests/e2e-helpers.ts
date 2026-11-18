import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

// Shared setup for *.e2e.test.ts files that drive the real commands.

/** Writes the package.json and folders `msg init` would set up. */
export function setupInitializedApp(root: string, isEsm: boolean): void {
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify(
      {
        name: "typed-app",
        version: "1.0.0",
        ...(isEsm ? { type: "module" } : {}),
        directories: { i18n: "i18n", l10n: "l10n", root: "." },
        imports: {
          "#i18n/*": "./i18n/*",
          "#l10n/*": "./l10n/*",
          "#root/*": "./*",
        },
      },
      null,
      2
    )
  );
  for (const dir of [
    ["i18n", "projects"],
    ["i18n", "resources"],
    ["l10n", "xliff"],
    ["l10n", "translations"],
  ]) {
    mkdirSync(join(root, ...dir), { recursive: true });
  }
}

/**
 * Turns the exported source-only XLIFF into a French translation by adding
 * trgLang and a <target> after each <source>, as a translator's tool would.
 */
export function translateXliff(xliff: string, translations: Record<string, string>): string {
  let out = xliff.replace(/srcLang="en"/, 'srcLang="en" trgLang="fr"');
  for (const [source, target] of Object.entries(translations)) {
    out = out.replace(
      `<source>${source}</source>`,
      `<source>${source}</source><target>${target}</target>`
    );
  }
  return out;
}
