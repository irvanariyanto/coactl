import { Option, type Command } from "commander";
import { initAction } from "./init.js";
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

import { importAction } from "./import.js";
import { enableCodexAction } from "./enable-codex.js";

export interface CommandSpec {
  name: string;
  description: string;
  configure?: (cmd: Command) => void;
}

// Default scope is auto-detected (walk up for agent.manifest.yaml, fall back to global).
// --global and --project force a side explicitly and are mutually exclusive.
function addManifestScopeOptions(cmd: Command, globalDescription: string): Command {
  return cmd
    .addOption(new Option("--global", globalDescription).conflicts("project"))
    .addOption(new Option("--project", "use project manifest (errors instead of falling back to global)").conflicts("global"));
}

export const commandSpecs: CommandSpec[] = [
  {
    name: "enable-codex",
    description: "Add Codex to compatible local asset targets in the active manifest scope",
    configure: (cmd) => {
      addManifestScopeOptions(cmd, "use global manifest").action(enableCodexAction);
    },
  },
  {
    name: "import",
    description: "Import assets from an existing AI tool into coactl",
    configure: (cmd) => {
      cmd
        .argument("[id]", "asset id to import")
        .option("--from <tool>", "source tool: claude-code|codex|cursor|windsurf|copilot (default: claude-code)")
        .option("--all", "import all assets from the source")
        .option("--global", "import from/to global scope")
        .option("--force", "overwrite existing assets")
        .action(importAction);
    },
  },
  {
    name: "init",
    description: "Initialize a new coactl project (creates agent.manifest.yaml)",
    configure: (cmd) => {
      cmd.option("--force", "overwrite existing manifest").option("--global", "create in global config dir (~/.config/coactl/)").action(initAction);
    },
  },
  {
    name: "add",
    description: "Scaffold a schema-valid asset",
    configure: (cmd) => {
      cmd.argument("<id>", "asset id").option("--kind <kind>", "asset kind").option("--force", "overwrite if asset already exists").option("--global", "add to global assets dir").action(addAction);
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
      addManifestScopeOptions(cmd.argument("<idAtVersion>", "asset id@version"), "use global manifest").action(installAction);
    },
  },
  {
    name: "update",
    description: "Update installed assets",
    configure: (cmd) => {
      addManifestScopeOptions(cmd, "use global manifest").action(updateAction);
    },
  },
  {
    name: "override",
    description: "Apply an override to an asset",
    configure: (cmd) => {
      addManifestScopeOptions(cmd.argument("<id>", "asset id"), "use global manifest").action(overrideAction);
    },
  },
  {
    name: "build",
    description: "Transform the registry into a target tool's native format",
    configure: (cmd) => {
      addManifestScopeOptions(cmd.option("--target <tool>", "target tool"), "use global manifest").action(buildAction);
    },
  },
  {
    name: "sync",
    description: "Write native config files for all configured AI tools (claude-code, codex, cursor, windsurf, copilot)",
    configure: (cmd) => {
      addManifestScopeOptions(cmd, "sync global scope")
        .option("--target <tool>", "limit sync to one target: claude-code|codex|cursor|windsurf|copilot")
        .option("--kind <kind>", "limit sync to one kind: skill|command|rule|workflow")
        .option("--strict", "fail when any selected asset is degraded or unsupported")
        .option("--prune", "remove stale Coactl-managed output for selected targets")
        .option("--dry-run", "preview writes and pruning without changing files")
        .action(syncAction);
    },
  },
  {
    name: "status",
    description: "Detect drift between generated files and the registry",
    configure: (cmd) => {
      addManifestScopeOptions(cmd.option("--json", "output as JSON"), "use global manifest").action(statusAction);
    },
  },
  {
    name: "why",
    description: "Show the winning source and override chain for an asset",
    configure: (cmd) => {
      addManifestScopeOptions(cmd.argument("<id>", "asset id").option("--json", "output as JSON"), "use global manifest").action(whyAction);
    },
  },
  {
    name: "explain",
    description: "Explain how an asset resolves",
    configure: (cmd) => {
      addManifestScopeOptions(cmd.argument("<id>", "asset id").option("--json", "output as JSON"), "use global manifest").action(explainAction);
    },
  },
];

export function registerCommands(program: Command): void {
  for (const spec of commandSpecs) {
    const cmd = program.command(spec.name).description(spec.description);
    spec.configure?.(cmd);
  }
}
