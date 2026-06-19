import chalk from "chalk";
import { createSpinner, printHeader, printNotImplemented } from "../../ui/output.js";

export async function syncAction(options: { global?: boolean; kind?: string }): Promise<void> {
  printHeader("sync");

  if (options.global) {
    console.log(chalk.dim("Scope: global"));
  }
  if (options.kind) {
    console.log(chalk.dim(`Kind filter: ${chalk.cyan(options.kind)}`));
  }

  const spinner = createSpinner("Syncing assets to targets...").start();
  spinner.info("Sync command not yet implemented (AC-011).");
  printNotImplemented("sync", "AC-011");
}
