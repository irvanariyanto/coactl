import * as p from "@clack/prompts";
import chalk from "chalk";
import { printNotImplemented } from "../../ui/output.js";
import { BRAND } from "../../tui/theme.js";

export async function overrideAction(id: string): Promise<void> {
  p.intro(chalk.bgCyan(chalk.black(` ${BRAND} override `)));

  p.log.info(`Asset: ${chalk.bold(id)}`);

  const fields = await p.multiselect({
    message: "Which fields do you want to override?",
    options: [
      { value: "targets", label: "Targets", hint: "Change which tools this asset syncs to" },
      { value: "scope", label: "Scope", hint: "Modify language or path scoping" },
      { value: "patch", label: "Patch body", hint: "Override the instruction body" },
    ],
    required: true,
  });

  if (p.isCancel(fields)) {
    p.cancel("Cancelled.");
    return;
  }

  p.log.info(`Would override fields: ${chalk.cyan((fields as string[]).join(", "))}`);
  printNotImplemented("override", "AC-016");
  p.outro(chalk.dim("Overrides will be implemented in AC-016."));
}
