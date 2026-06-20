# coactl

Define agent assets once, sync them to multiple AI coding tools.

Maintain a single source of truth for your AI assistant configuration — skills, commands, rules, and workflows — and compile it to Claude Code, Cursor, Windsurf, and Copilot's native formats.

## Installation

```bash
npm install -g coactl
```

Or run directly after cloning:

```bash
npm install && npm run build
node dist/cli/index.js --help
```

## Quick Start

```bash
# 1. Initialize a project
coactl init

# 2. Scaffold an asset
coactl add --kind rule my-rule

# 3. Edit assets/my-rule/body.md with your instructions

# 4. Preview what would be generated
coactl build --target claude-code

# 5. Write native files to disk
coactl sync
```

## Concepts

| Term | Description |
|------|-------------|
| **Asset** | A unit of AI guidance with a `kind`: `skill`, `command`, `rule`, or `workflow` |
| **Source** | Where assets come from: `local`, `git`, `url`, or `package` |
| **Registry** | The merged, resolved view across all sources |
| **Adapter** | Transforms canonical assets into a tool's native format |

### Asset kinds

| Kind | Claude Code | Cursor | Windsurf | Copilot |
|------|-------------|--------|----------|---------|
| `skill` | `.claude/skills/` | `.cursor/rules/` (degraded) | `.windsurfrules` (degraded) | `copilot-instructions.md` (degraded) |
| `command` | `.claude/commands/` | `.cursor/rules/` (degraded) | skipped | skipped |
| `rule` | `CLAUDE.md` | `.cursor/rules/` | `.windsurfrules` | `copilot-instructions.md` |
| `workflow` | `.claude/commands/` | skipped | skipped | skipped |

## Project structure

```
agent.manifest.yaml   # sources + precedence + overrides
agent.lock.yaml       # integrity hashes (auto-generated)
assets/
  my-rule/
    asset.yaml        # metadata
    body.md           # instructions
```

### agent.manifest.yaml

```yaml
sources:
  - name: local
    type: local
    path: ./assets

  # optional remote sources
  - name: community
    type: git
    url: https://github.com/example/agent-skills.git
    ref: main
    subdir: assets

resolution:
  precedence:
    - local       # local wins on id conflict
    - community

overrides:
  some-remote-rule:
    targets: [claude-code]   # only sync to specific tools
    patch: patches/my-override.md
```

## Commands

### `coactl init`
Scaffold `agent.manifest.yaml` and create the `assets/` directory.

```bash
coactl init           # interactive
coactl init --force   # overwrite existing manifest
```

### `coactl add`
Scaffold a new asset under `assets/<id>/`.

```bash
coactl add --kind rule my-rule
coactl add --kind skill my-skill
coactl add --kind command my-cmd
coactl add --kind workflow my-flow
coactl add my-asset   # prompts for kind interactively
```

### `coactl build`
Dry-run — show files that would be generated without writing to disk.

```bash
coactl build --target claude-code
coactl build --target cursor --kind rule
```

### `coactl sync`
Write native files to disk for all configured tools.

```bash
coactl sync                        # all targets
coactl sync --target cursor        # one tool only
coactl sync --kind rule            # one kind only
coactl sync --global               # write to ~/.claude/, ~/.cursor/, etc.
```

### `coactl status`
Detect drift between the registry and generated files.

```bash
coactl status
coactl status --json    # CI-friendly output
```

Exit code 0 = clean, 1 = drift detected.

### `coactl install`
Fetch an asset from a remote source and record its integrity hash.

```bash
coactl install my-skill
coactl install my-skill@1.0.0
```

### `coactl update`
Refresh all read-only remote sources and update `agent.lock.yaml`.

```bash
coactl update
```

### `coactl override`
Scaffold an override block in `agent.manifest.yaml` for a remote asset.

```bash
coactl override some-remote-rule
```

### `coactl why`
Show where an asset came from and what overrides were applied.

```bash
coactl why my-rule
coactl why my-rule --json
```

### `coactl explain`
Show how an asset maps to each tool — capability, output path, warnings.

```bash
coactl explain my-skill
coactl explain my-skill --json
```

### `coactl dashboard`
Open the interactive TUI with panels for assets, details, and sources.

```bash
coactl dashboard
# keyboard: Tab = switch panel, j/k = navigate, q = quit
```

## Installing from external sources

Add a remote source to `agent.manifest.yaml`, then use `coactl install`:

**Git repository:**
```yaml
sources:
  - name: team-skills
    type: git
    url: https://github.com/your-org/agent-skills.git
    ref: main
    subdir: assets
```

**Tarball URL:**
```yaml
sources:
  - name: remote-pack
    type: url
    url: https://example.com/skills-bundle.tar.gz
```

**npm package:**
```yaml
sources:
  - name: npm-skills
    type: package
    registry: https://registry.npmjs.org
    install: "@your-org/agent-skills"
```

External assets are read-only. Use `coactl override` to customize them without forking.

## Development

```bash
npm install
npm run build        # compile TypeScript
npm test             # run test suite
npm run dev          # run CLI with tsx (no build needed)
npm run dashboard    # open TUI
```

## License

MIT
