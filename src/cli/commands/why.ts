import chalk from "chalk";
import { createTable, printHeader, printNotImplemented } from "../../ui/output.js";

export async function whyAction(id: string): Promise<void> {
  printHeader(`why ${id}`);

  const table = createTable(["Source", "Precedence", "Overrides"]);
  table.push([chalk.dim("(no data)"), chalk.dim("—"), chalk.dim("—")]);
  console.log(table.toString());

  printNotImplemented("why", "AC-017");
}
