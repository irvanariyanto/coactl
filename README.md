# coactl (web)

**Related:** [docs/PRD.md](docs/PRD.md) · Legacy CLI frozen at tag `cli-v0.1.0` / branch `archive/cli-v0.1`

Local web app that manages **native AI coding skills and rules** with a clear **Global vs Project** flow.

No `.coactl` registry — files stay in each tool’s own folders.

## User flow

```
Home → Global | Project
  → Tools
    → Resources (Skills | Rules)
      → List → Detail (CRUD + import)
```

| Mode | Entry | Tools shown | Managed |
|------|-------|-------------|---------|
| **Global** | One click | Installed on the machine | `~/…/skills`, `~/…/rules` |
| **Project** | Pick project dir first | Detected in that repo (`.claude`, `.cursor`, …) | `<project>/…/skills`, `…/rules` |

**Import** from a detail view can copy to other tools and across scopes (global ↔ project),
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

## Native rule / instruction paths

| Tool | Project | Global | Shape |
|------|---------|--------|-------|
| Cursor | `.cursor/rules/<id>.mdc` | `~/.cursor/rules/<id>.mdc` | multi |
| Claude Code | `.claude/rules/<id>.md` | `~/.claude/rules/<id>.md` | multi |
| OpenCode | `.opencode/rules/<id>.md` | `~/.config/opencode/rules/` | multi |
| Antigravity | `.agents/rules/<id>.md` | `$ANTIGRAVITY_HOME/rules/` | multi |
| Codex | `AGENTS.md` | `$CODEX_HOME/AGENTS.md` | singleton |
| Zed | `AGENTS.md` | `$ZED_HOME/AGENTS.md` | singleton |
| Gemini | `GEMINI.md` | `$GEMINI_HOME/GEMINI.md` | singleton |

## Native command / slash-workflow paths

| Tool | Project | Global |
|------|---------|--------|
| Claude Code | `.claude/commands/<id>.md` | `~/.claude/commands/` |
| Cursor | `.cursor/commands/<id>.md` | `~/.cursor/commands/` |
| OpenCode | `.opencode/commands/<id>.md` | `~/.config/opencode/commands/` |
| Antigravity | `.agents/workflows/<id>.md` | `$ANTIGRAVITY_HOME/workflows/` |

## Native Claude workflow paths

| Tool | Project | Global | File |
|------|---------|--------|------|
| Claude Code | `.claude/workflows/<id>.js` | `~/.claude/workflows/` | dynamic workflow script (`export const meta`) |

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/workspace?mode=global\|project&root=` | Tools + skill/rule counts + resolved paths |
| GET | `/api/skills?tool=&scope=` | List skills (one row per physical path, `readOnly` flag) |
| GET/PUT/DELETE | `/api/skills/:tool/:id?scope=&path=` | Read / update / delete (optional `path` picks a duplicate) |
| POST | `/api/skills` | Create (always the preferred writable dir) |
| POST | `/api/skills/scaffold` | Scaffold (+ save) |
| POST | `/api/skills/import` | Copy to other tools/scopes (`dryRun: true` previews) |
| GET | `/api/rules?tool=&scope=` | List rules / instruction files |
| GET/PUT/DELETE | `/api/rules/:tool/:id?scope=&path=` | Read / update / delete rule file |
| POST | `/api/rules` | Create rule |
| POST | `/api/rules/scaffold` | Scaffold (+ save) |
| POST | `/api/rules/import` | Copy across rule tools/scopes (`dryRun` previews) |
| GET | `/api/commands?tool=&scope=` | List slash commands (supported tools) |
| GET/PUT/DELETE | `/api/commands/:tool/:id?scope=&path=` | Read / update / delete command |
| POST | `/api/commands` | Create command |
| POST | `/api/commands/scaffold` | Scaffold (+ save) |
| POST | `/api/commands/import` | Copy across command tools/scopes (`dryRun` previews) |
| GET | `/api/workflows?tool=&scope=` | List Claude dynamic workflows |
| GET/PUT/DELETE | `/api/workflows/:tool/:id?scope=&path=` | Read / update / delete workflow script |
| POST | `/api/workflows` | Create workflow |
| POST | `/api/workflows/scaffold` | Scaffold (+ save) |
| POST | `/api/workflows/import` | Copy across scopes (`dryRun` previews) |
| POST | `/api/pick-folder` | Native OS folder picker for project root |

Writes into read-only vendor dirs are rejected with `403`.

Import body (skills or rules):

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
packages/domain/   detection, skill/rule IO, import
```

## License

MIT
