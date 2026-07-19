# coactl (web)

**Related:** [docs/PRD.md](docs/PRD.md) · Legacy CLI frozen at tag `cli-v0.1.0` / branch `archive/cli-v0.1`

Local web app that manages **native AI coding skills** with a clear **Global vs Project** flow.

No `.coactl` registry — skills stay in each tool’s own folders.

## User flow

```
Home → Global | Project
  → Tools
    → Resources (Skills)
      → Skill list
        → Skill detail (CRUD + import)
```

| Mode | Entry | Tools shown | Skills managed |
|------|-------|-------------|----------------|
| **Global** | One click | Installed on the machine | `~/…/skills` |
| **Project** | Pick project dir first | Detected in that repo (`.claude`, `.cursor`, …) | `<project>/…/skills` |

**Import** from a skill detail can copy to other tools and across scopes (global ↔ project),
with a dry-run preview (write / skip / overwrite per target) before anything is written.

Safety rules:

- Vendor-managed trees (Cursor `skills-cursor`) are **read-only**: listed and importable-from,
  but create/update/delete/import-to are blocked in both the UI and the API.
- The same skill id in two candidate dirs (e.g. Codex `.agents/skills` and `.codex/skills`)
  is listed once **per physical path**; new skills always go to the preferred write target.

## Quick start

```bash
npm install
npm run dev   # builds domain, starts API + web, opens http://127.0.0.1:5173
```

Or run the pieces separately: `npm run dev:server` (API on `http://127.0.0.1:8787`) and
`npm run dev:web` (UI on `http://127.0.0.1:5173`).

## Native skill paths

| Tool | Project | Global (resolved from disk / env) |
|------|---------|-----------------------------------|
| Claude Code | `.claude/skills/` | `~/.claude/skills/` |
| Cursor | `.cursor/skills/` (+ `skills-cursor`) | `~/.cursor/skills/` (+ `skills-cursor`) |
| Codex | `.agents/skills/` (+ `.codex/skills` legacy) | `$CODEX_HOME/skills` or `~/.codex/skills` |
| Zed | `.agents/skills/` | `$ZED_HOME/skills` or `~/.config/zed/skills` |
| Gemini | `.gemini/skills/` | `$GEMINI_HOME/skills` or `~/.gemini/skills` |
| OpenCode | `.opencode/skills/` | `~/.opencode/skills` or `~/.config/opencode/skills` |
| Antigravity | `.antigravity/skills/` | `$ANTIGRAVITY_HOME/skills` or `~/.antigravity/skills` |

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/workspace?mode=global\|project&root=` | Tools + counts + resolved paths (incl. `writable`) |
| GET | `/api/skills?tool=&scope=` | List skills (one row per physical path, `readOnly` flag) |
| GET/PUT/DELETE | `/api/skills/:tool/:id?scope=&path=` | Read / update / delete (optional `path` picks a duplicate) |
| POST | `/api/skills` | Create (always the preferred writable dir) |
| POST | `/api/skills/scaffold` | Scaffold (+ save) |
| POST | `/api/skills/import` | Copy to other tools/scopes (`dryRun: true` previews) |
| POST | `/api/pick-folder` | Native OS folder picker for project root |

Writes into read-only vendor dirs are rejected with `403`.

Import body:

```json
{
  "source": { "tool": "claude-code", "scope": "global", "id": "review-pr" },
  "targets": [
    { "tool": "cursor", "scope": "global" },
    { "tool": "cursor", "scope": "project" }
  ],
  "overwrite": false
}
```

## Layout

```
apps/web/          Vite + React UI (drill-down)
apps/server/       Hono API (127.0.0.1 only)
packages/domain/   detection, skill IO, import
```

## License

MIT
