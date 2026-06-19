import * as p from "@clack/prompts";
import chalk from "chalk";
import { printNotImplemented } from "../../ui/output.js";
import { BRAND } from "../../tui/theme.js";

export async function installAction(idAtVersion: string): Promise<void> {
  p.intro(chalk.bgCyan(chalk.black(` ${BRAND} install `)));

  const [id, version] = idAtVersion.split("@");
  p.log.info(`Asset: ${chalk.bold(id ?? idAtVersion)}`);
  if (version) {
    p.log.info(`Version: ${chalk.cyan(version)}`);
  }

  const confirmed = await p.confirm({
    message: `Install ${chalk.bold(idAtVersion)}?`,
  });

  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel("Installation cancelled.");
    return;
  }

  printNotImplemented("install", "AC-013");
  p.outro(chalk.dim("Install will be implemented in AC-013."));
}
