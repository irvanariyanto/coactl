import * as p from "@clack/prompts";
import chalk from "chalk";
import { printNotImplemented } from "../../ui/output.js";
import { BRAND } from "../../tui/theme.js";

export async function sourceAddAction(name: string, options: { type?: string }): Promise<void> {
  p.intro(chalk.bgCyan(chalk.black(` ${BRAND} source add `)));

  let sourceType = options.type;

  if (!sourceType) {
    const selected = await p.select({
      message: "What type of source?",
      options: [
        { value: "local", label: "Local", hint: "Path to a local assets directory" },
        { value: "git", label: "Git", hint: "Git repository URL" },
        { value: "url", label: "URL", hint: "URL to a tarball" },
        { value: "package", label: "Package", hint: "npm/registry package" },
      ],
    });
    if (p.isCancel(selected)) {
      p.cancel("Cancelled.");
      return;
    }
    sourceType = selected as string;
  }

  p.log.info(`Would register ${chalk.cyan(sourceType)} source: ${chalk.bold(name)}`);
  printNotImplemented("source add");
  p.outro(chalk.dim("Source management is not yet implemented."));
}
