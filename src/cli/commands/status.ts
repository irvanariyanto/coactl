import chalk from "chalk";
import { createSpinner, createTable, printHeader, printNotImplemented } from "../../ui/output.js";

export async function statusAction(): Promise<void> {
  printHeader("status");

  const spinner = createSpinner("Checking registry drift...").start();
  spinner.info("Status command not yet implemented (AC-018).");

  const table = createTable(["Asset", "Status", "Source"]);
  table.push([chalk.dim("(no assets)"), chalk.dim("—"), chalk.dim("—")]);
  console.log(table.toString());

  printNotImplemented("status", "AC-018");
}
