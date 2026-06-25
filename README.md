<div align="center">

```
 ██████╗ ██████╗  █████╗  ██████╗████████╗██╗
██╔════╝██╔═══██╗██╔══██╗██╔════╝╚══██╔══╝██║
██║     ██║   ██║███████║██║        ██║   ██║
██║     ██║   ██║██╔══██║██║        ██║   ██║
╚██████╗╚██████╔╝██║  ██║╚██████╗   ██║   ███████╗
 ╚═════╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝   ╚═╝   ╚══════╝
```

**Define agent assets once. Sync them everywhere.**

[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen)](#development)

</div>

---

`coactl` is a CLI tool that manages AI assistant configuration — skills, commands, rules, and workflows — as a single source of truth, then compiles and syncs them to each tool's native format.

```
  Your assets                      Native outputs
  ──────────                       ──────────────
  .coactl/rules/
    my-rule/RULE.md      ──►  .claude/        (Claude Code)
                         ──►  .agents/skills/ (Codex)
                         ──►  .antigravity/   (Antigravity)
                         ──►  .gemini/        (Gemini CLI)
                         ──►  .clinerules/    (Cline)
                         ──►  .roo/rules/     (Roo Code)
                         ──►  .continue/      (Continue)
                         ──►  CONVENTIONS.md  (Aider)
                         ──►  .opencode/      (OpenCode)
                         ──►  .aiassistant/   (JetBrains AI)
                         ──►  .cursor/rules/  (Cursor)
                         ──►  .windsurfrules  (Windsurf)
                         ──►  .github/        (Copilot)
```

## Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Global Setup](#global-setup)
- [Concepts](#concepts)
- [Commands](#commands)
- [External Sources](#external-sources)
- [Development](#development)

---

## Installation

```bash
npm install -g coactl
```

Or run after cloning:

```bash
git clone https://github.com/your-org/coactl
cd coactl && npm install && npm run build
npm link    # makes 'coactl' available globally
```

---

## Quick Start

```bash
# 1. Bootstrap a project
coactl init

# 2. Author your first asset
coactl add --kind rule my-coding-standards

# 3. Edit the body
$EDITOR .coactl/rules/my-coding-standards/RULE.md

# 4. Preview generated files (dry run)
coactl build --target claude-code

# 5. Sync to all tools
coactl sync

# 6. Open the interactive dashboard
coactl dashboard
```

---

## Global Setup

Use `--global` to manage assets that apply across every project on your machine, not just the current directory. Global config lives at `~/.config/coactl/` and syncs to each tool's user-level config directory (`~/.claude/`, `~/.agents/skills/`, `~/.cursor/`, etc.).

```bash
# 1. Bootstrap the global config (one-time)
coactl init --global

# 2. Scaffold a global asset
coactl add --kind rule my-standards --global

# 3. Edit it
$EDITOR ~/.config/coactl/rules/my-standards/RULE.md

# 4. Sync to all tools globally
coactl sync --global
```

All commands support `--global`. Without it, commands read and write inside the current project directory as usual.

| Path | Purpose |
|------|---------|
| `~/.config/coactl/agent.manifest.yaml` | Global manifest (sources, overrides) |
| `~/.config/coactl/{skills,commands,rules,workflows}/` | Global canonical asset definitions |
| `~/.claude/`, `~/.agents/skills/`, `~/.codex/`, `~/.antigravity/`, `~/.gemini/`, `~/.cursor/`, … | Tool-specific output (written by `sync --global`) |

---

## Concepts

### Asset kinds

Each asset has a `kind` that determines how adapters emit it:

| Kind | Description | Example use case |
|------|-------------|-----------------|
| `rule` | Always-on guidance | Coding standards, style guides |
| `skill` | Triggered by file patterns or agent decision | TypeScript review, test writing |
| `command` | Explicitly invoked (e.g. `/review`) | Custom slash commands |
| `workflow` | Multi-step orchestration with loops | Plan → implement → test cycles |

### Tool compatibility matrix

| Kind | Native support |
|------|----------------|
| `rule` | Claude Code, Codex, Antigravity, Gemini CLI, Cline, Roo Code, Continue, OpenCode, Zed, JetBrains AI, Cursor, Windsurf, Copilot |
| `skill` | Claude Code, Codex, Antigravity, Gemini CLI, OpenCode, Zed |
| `command` | Claude Code; Codex global prompts; Antigravity best-effort markdown; Cursor best-effort rule |
| `workflow` | Claude Code |

Degraded mappings:

| Kind | Degraded targets |
|------|------------------|
| `rule` | Aider (`CONVENTIONS.md`) |
| `skill` | Cline, Roo Code, Continue, JetBrains AI, Cursor, Windsurf, Copilot |
| `command` | Codex global only, Antigravity, Cursor |

✅ native · ⚠️ best-effort with warning · ➖ skipped with notice

### Key files

```
.coactl/agent.manifest.yaml  ← sources, precedence, overrides (you edit this)
.coactl/agent.lock.yaml      ← integrity hashes           (auto-managed)
.coactl/skills/              ← skill definitions          (you edit these)
.coactl/commands/            ← command definitions        (you edit these)
.coactl/rules/               ← rule definitions           (you edit these)
.coactl/workflows/           ← workflow definitions       (you edit these)
```

### agent.manifest.yaml

```yaml
sources:
  - name: local
    type: local
    path: .

  - name: team-shared          # optional remote source
    type: git
    url: https://github.com/your-org/agent-skills.git
    ref: main
    subdir: assets

resolution:
  precedence:
    - local          # local assets win on id conflict
    - team-shared

overrides:           # customize remote assets without forking
  some-remote-rule:
    targets: [claude-code]
    patch: patches/custom-body.md
```

---

## Commands

### `coactl init`
Bootstrap a new project — creates `agent.manifest.yaml` and `assets/`.

```bash
coactl init           # interactive prompts
coactl init --force   # overwrite existing manifest
```

---

### `coactl add`
Scaffold a new asset with kind-specific templates.

```bash
coactl add --kind rule     my-rule
coactl add --kind skill    my-skill
coactl add --kind command  my-cmd
coactl add --kind workflow my-flow
coactl add my-asset        # prompts for kind interactively
coactl add my-asset --force  # overwrite existing
```

---

### `coactl build`
Dry-run compile — shows what would be written without touching disk.

```bash
coactl build --target claude-code
coactl build --target cursor --kind rule
```

---

### `coactl sync`
Write native files to disk for all configured tools.

```bash
coactl sync                      # installed targets only, project scope
coactl sync --target cursor      # one tool only
coactl sync --target codex       # Codex skills and project AGENTS.md rules
coactl sync --target antigravity # Antigravity skills, commands, and AGENTS.md rules
coactl sync --target gemini      # Gemini skills and GEMINI.md rules
coactl sync --target cline       # Cline .clinerules output
coactl sync --target opencode    # OpenCode skills and AGENTS.md rules
coactl sync --kind rule          # one kind only
coactl sync --global             # write to ~/.claude/, ~/.cursor/, …
coactl sync --global --strict    # fail if any mapping is degraded or skipped
coactl sync --global --prune     # remove stale Coactl-managed output
coactl sync --global --prune --dry-run  # preview writes and pruning
```

Without `--target`, sync detects installed tools on the device (PATH commands and known config directories) and writes only those targets. Use `--target <tool>` to force a target even when it is not detected.

---

### `coactl import`
Import assets from an existing AI tool into coactl so they can be synced to other tools.

```bash
# Import from detected installed tools
coactl import my-skill
coactl import --all              # scan installed tools only
coactl import --all --global     # scan installed tools at global paths

# Cursor rules
coactl import --from cursor my-rule
coactl import --from cursor --all

# Antigravity skills, commands, and AGENTS.md rules
coactl import --from antigravity --all

# Other tools
coactl import --from gemini --all
coactl import --from cline --all
coactl import --from roo-code --all
coactl import --from continue --all
coactl import --from aider --all
coactl import --from opencode --all
coactl import --from zed --all
coactl import --from jetbrains --all

# Windsurf / Copilot (splits coactl-managed blocks; falls back to one rule)
coactl import --from windsurf --all
coactl import --from copilot --all

coactl import my-skill --force     # overwrite existing asset
```

Without `--from`, import scans detected installed tools. Use `--from <tool>` to force a specific source.

Imported assets get a canonical asset definition (targeting every compatible configured tool) and the original body. Run `coactl sync` after importing to generate native files for other tools.

---

### `coactl status`
Detect drift between the registry and files on disk.

```bash
coactl status           # table output
coactl status --json    # machine-readable (CI-friendly)
```

Exit code `0` = clean · Exit code `1` = drift detected

Drift states: `clean` · `modified` (hand-edited) · `stale` (registry changed) · `missing`

---

### `coactl install`
Fetch a specific asset from a remote source and record its sha256 integrity hash.

```bash
coactl install my-skill            # latest available
coactl install my-skill@1.0.0     # pinned version
```

---

### `coactl update`
Re-resolve all remote sources to their latest ref and update `agent.lock.yaml`.

```bash
coactl update
```

---

### `coactl override`
Scaffold an `overrides` block in the manifest to customize a remote asset.

```bash
coactl override some-remote-rule
```

---

### `coactl why`
Show where an asset came from, the full precedence chain, and applied overrides.

```bash
coactl why my-rule
coactl why my-rule --json
```

---

### `coactl explain`
Show how an asset maps to each tool — capability, output path, diagnostics.

```bash
coactl explain my-skill
coactl explain my-skill --json
```

---

### `coactl dashboard`
Open the fullscreen interactive TUI.

```bash
coactl dashboard
```

```
┌─────────────────────────────────────────────────┐
│ coactl — Dashboard                         v0.1 │
├──────────────────────┬──────────────────────────┤
│ Assets               │ Details                  │
│ ❯ skill/review    ✓  │ Kind:    skill            │
│   command/test    ✓  │ Version: 0.1.0            │
│   rule/format     ⚠  │ Source:  local            │
│   workflow/deploy ✗  │ Targets: claude, cursor   │
├──────────────────────┴──────────────────────────┤
│ Sources                                         │
│ local  ./assets  4 assets                       │
├─────────────────────────────────────────────────┤
│ [Tab] panel  [j/k] nav  [Enter] select  [q] quit│
└─────────────────────────────────────────────────┘
```

---

## External Sources

Three remote source types are supported. Add them to `agent.manifest.yaml`, then run `coactl install <id>`.

**Git repository**
```yaml
sources:
  - name: team-skills
    type: git
    url: https://github.com/your-org/agent-skills.git
    ref: main
    subdir: assets    # optional subdirectory
```

**Tarball URL**
```yaml
sources:
  - name: release-pack
    type: url
    url: https://example.com/agent-skills-v1.tar.gz
```

**npm-style package**
```yaml
sources:
  - name: org-skills
    type: package
    registry: https://registry.npmjs.org
    install: "@your-org/agent-skills"
```

> Remote assets are always **read-only**. Use `coactl override` to customize them locally without forking.

---

## Development

```bash
npm install          # install dependencies
npm run build        # compile TypeScript → dist/
npm test             # run test suite
npm run dev          # run CLI via tsx (no build step)
npm run dashboard    # launch TUI directly
```

**Tech stack:** TypeScript · ESM · Node ≥ 20 · commander · Ink (TUI) · clack · zod · yaml

---

<div align="center">

MIT License · Built with [Claude Code](https://claude.ai/code)

</div>
