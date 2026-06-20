#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { registerCommands } from "./commands/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "..", "package.json"), "utf-8")) as {
  version: string;
};

const program = new Command();

program.name("coactl").description("Define agent assets once, sync them to multiple AI coding tools.").version(pkg.version);

registerCommands(program);

program
  .command("dashboard")
  .description("Open the interactive TUI dashboard")
  .option("--global", "use global manifest")
  .action(async (options: { global?: boolean }) => {
    const { dashboardAction } = await import("./commands/dashboard.js");
    await dashboardAction(options);
  });

program.action(async () => {
  if (!process.stdout.isTTY) {
    program.help();
    return;
  }
  const { dashboardAction } = await import("./commands/dashboard.js");
  await dashboardAction();
});

program.parse(process.argv);
