import * as p from "@clack/prompts";
import chalk from "chalk";
import { printNotImplemented } from "../../ui/output.js";
import { BRAND } from "../../tui/theme.js";

export async function addAction(id: string, options: { kind?: string }): Promise<void> {
  p.intro(chalk.bgCyan(chalk.black(` ${BRAND} add `)));

  let kind = options.kind;

  if (!kind) {
    const selected = await p.select({
      message: "What kind of asset?",
      options: [
        { value: "skill", label: "Skill", hint: "Triggered by file patterns or agent decisions" },
        { value: "command", label: "Command", hint: "Invoked explicitly, e.g. /review" },
        { value: "rule", label: "Rule", hint: "Always-on guidance" },
        { value: "workflow", label: "Workflow", hint: "Multi-step orchestration" },
      ],
    });
    if (p.isCancel(selected)) {
      p.cancel("Cancelled.");
      return;
    }
    kind = selected as string;
  }

  p.log.info(`Would scaffold ${chalk.cyan(kind)} asset: ${chalk.bold(id)}`);
  printNotImplemented("add", "AC-004");
  p.outro(chalk.dim("Asset scaffolding will be implemented in AC-004."));
}
