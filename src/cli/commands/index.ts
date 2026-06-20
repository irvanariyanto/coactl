import type { Command } from "commander";
import { addAction } from "./add.js";
import { sourceAddAction } from "./source.js";
import { installAction } from "./install.js";
import { updateAction } from "./update.js";
import { overrideAction } from "./override.js";
import { buildAction } from "./build.js";
import { syncAction } from "./sync.js";
import { statusAction } from "./status.js";
import { whyAction } from "./why.js";
import { explainAction } from "./explain.js";

export interface CommandSpec {
  name: string;
  description: string;
  configure?: (cmd: Command) => void;
}

export const commandSpecs: CommandSpec[] = [
  {
    name: "add",
    description: "Scaffold a schema-valid asset",
    configure: (cmd) => {
      cmd.argument("<id>", "asset id").option("--kind <kind>", "asset kind").option("--force", "overwrite if asset already exists").action(addAction);
    },
  },
  {
    name: "source",
    description: "Manage asset sources",
    configure: (cmd) => {
      cmd
        .command("add <name>")
        .description("Add a new asset source")
        .option("--type <type>", "source type")
        .action(sourceAddAction);
    },
  },
  {
    name: "install",
    description: "Fetch and install an asset by id and version",
    configure: (cmd) => {
      cmd.argument("<idAtVersion>", "asset id@version").action(installAction);
    },
  },
  {
    name: "update",
    description: "Update installed assets",
    configure: (cmd) => {
      cmd.action(updateAction);
    },
  },
  {
    name: "override",
    description: "Apply an override to an asset",
    configure: (cmd) => {
      cmd.argument("<id>", "asset id").action(overrideAction);
    },
  },
  {
    name: "build",
    description: "Transform the registry into a target tool's native format",
    configure: (cmd) => {
      cmd.option("--target <tool>", "target tool").action(buildAction);
    },
  },
  {
    name: "sync",
    description: "Write native files for all configured targets",
    configure: (cmd) => {
      cmd
        .option("--global", "sync global scope")
        .option("--kind <kind>", "limit sync to a kind")
        .action(syncAction);
    },
  },
  {
    name: "status",
    description: "Detect drift between generated files and the registry",
    configure: (cmd) => {
      cmd.option("--json", "output as JSON").action(statusAction);
    },
  },
  {
    name: "why",
    description: "Show the winning source and override chain for an asset",
    configure: (cmd) => {
      cmd.argument("<id>", "asset id").option("--json", "output as JSON").action(whyAction);
    },
  },
  {
    name: "explain",
    description: "Explain how an asset resolves",
    configure: (cmd) => {
      cmd.argument("<id>", "asset id").option("--json", "output as JSON").action(explainAction);
    },
  },
];

export function registerCommands(program: Command): void {
  for (const spec of commandSpecs) {
    const cmd = program.command(spec.name).description(spec.description);
    spec.configure?.(cmd);
  }
}
