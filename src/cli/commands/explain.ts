import chalk from "chalk";
import { createTable, printHeader, printNotImplemented } from "../../ui/output.js";

export async function explainAction(id: string): Promise<void> {
  printHeader(`explain ${id}`);

  const table = createTable(["Target", "Capability", "Output Path"]);
  table.push(
    ["Claude Code", chalk.green("native"), chalk.dim("—")],
    ["Cursor", chalk.yellow("degraded"), chalk.dim("—")],
    ["Windsurf", chalk.yellow("degraded"), chalk.dim("—")],
    ["Copilot", chalk.yellow("degraded"), chalk.dim("—")],
  );
  console.log(table.toString());

  printNotImplemented("explain", "AC-022");
}
