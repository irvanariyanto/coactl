import chalk from "chalk";
import { createSpinner, printHeader, printNotImplemented } from "../../ui/output.js";

export async function buildAction(options: { target?: string }): Promise<void> {
  printHeader("build");

  if (options.target) {
    console.log(chalk.dim(`Target: ${chalk.cyan(options.target)}`));
  }

  const spinner = createSpinner("Compiling registry for target...").start();
  spinner.info("Build command not yet implemented (AC-011).");
  printNotImplemented("build", "AC-011");
}
