import * as p from "@clack/prompts";
import chalk from "chalk";
import { existsSync } from "node:fs";
import { loadManifest } from "../../schema/load.js";
import { resolveScope } from "../../io/global-paths.js";
import { updateLocalAssetTargets } from "../../registry/target-updates.js";
import { detectInstalledTargets } from "../../tools/detect.js";
import { BRAND } from "../../tui/theme.js";

export async function enableInstalledToolsAction(options: { global?: boolean; project?: boolean }): Promise<void> {
  p.intro(chalk.bgCyan(chalk.black(` ${BRAND} enable-installed-tools `)));

  const { path: manifestPath, scope } = resolveScope(options);
  if (!existsSync(manifestPath)) {
    p.log.error(
      scope === "global"
        ? 'No global manifest found. Run "coactl init --global" first.'
        : `No project manifest found at ${manifestPath}. Run "coactl init" first.`,
    );
    process.exitCode = 1;
    return;
  }

  const installedTargets = detectInstalledTargets();
  if (installedTargets.length === 0) {
    p.log.warn("No installed AI tools detected.");
    return;
  }

  const manifest = loadManifest(manifestPath);
  const result = updateLocalAssetTargets({
    manifestPath,
    manifest,
    scope,
    targets: installedTargets,
    enable: true,
  });

  if (result.updated === 0) {
    p.log.warn("No asset targets changed.");
  } else {
    p.log.success(`Enabled installed tools for ${chalk.bold(String(result.updated))} compatible asset${result.updated === 1 ? "" : "s"}.`);
  }

  p.log.info(`Detected targets: ${installedTargets.join(", ")}`);
  if (result.alreadyEnabled > 0) p.log.info(`${result.alreadyEnabled} target assignment${result.alreadyEnabled === 1 ? "" : "s"} already enabled.`);
  if (result.skippedUnsupported > 0) p.log.info(`${result.skippedUnsupported} target assignment${result.skippedUnsupported === 1 ? "" : "s"} skipped because the asset kind is unsupported.`);
  if (result.skippedReadOnlySources > 0) p.log.info(`${result.skippedReadOnlySources} non-local source${result.skippedReadOnlySources === 1 ? "" : "s"} skipped because automatic target updates only apply to local assets.`);
  if (result.skippedNonCoactl > 0) p.log.info(`${result.skippedNonCoactl} file${result.skippedNonCoactl === 1 ? "" : "s"} skipped because they are not coactl-managed assets.`);
  if (result.skippedInvalid > 0) p.log.warn(`${result.skippedInvalid} file${result.skippedInvalid === 1 ? "" : "s"} were skipped due to invalid frontmatter. Fix them manually and rerun the command.`);

  p.outro(chalk.green("Done."));
}
