# coactl (web)

**Version:** 0.3.0 · **Related:** [docs/PRD.md](docs/PRD.md) · Legacy CLI frozen at tag `cli-v0.1.0` / branch `archive/cli-v0.1`

Local web app that manages **native AI coding skills and rules** with a clear **Global vs Project** flow.

No `.coactl` registry — files stay in each tool’s own folders.

coactl keeps its own project history and UI profile in SQLite at `~/.coactl/coactl.db`. Native
tool files remain the source of truth and are not copied into the database.

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

**Install from Git** on a Skills list shallow-clones a public repo, finds `SKILL.md` folders
(`skills/`, `.claude/skills/`, …), previews targets, and writes into the current tool’s native dir.

The same remote installer also accepts native skill packs from an **npm package** (using
`npm pack`, never `npm install`) or a local/HTTPS **`.zip`, `.tgz`, or `.tar.gz` archive**.
Choose the Pack tab, preview the discovered skills, then use the same overwrite and diff flow.
For local archives, use Browse to select the file with the native OS picker or enter its path.
Legacy CLI `assets/` + `asset.yaml` packs are not mapped; only `SKILL.md` trees are discovered.

Remote installs preserve the complete native skill directory, including sibling `scripts/`,
`references/`, templates, and binary assets. Symlinks and special files are rejected; each skill
is limited to 1,000 files and 20 MiB, and overwrite replaces the directory as one atomic unit.

The Smart Install field also accepts GitHub shorthand and Skills CLI commands, for example
`addyosmani/agent-skills` or `npx skills add addyosmani/agent-skills`. Pasted commands are parsed
only; coactl never executes them.

Safety rules:

- Vendor-managed trees (Cursor `skills-cursor`) are **read-only**: listed and importable-from,
  but create/update/delete/import-to are blocked in both the UI and the API.
- The same skill id in two candidate dirs (e.g. Codex `.agents/skills` and `.codex/skills`)
  is listed once **per physical path**; new skills always go to the preferred write target.

## Portable profile

The home screen can export project history and app settings to a versioned
`coactl-profile-YYYY-MM-DD.json` document. Import always previews added, updated, and removed project entries
before applying them transactionally to SQLite. Login hashes, session secrets, editor drafts, and
native tool files are excluded.

Set `COACTL_DB_FILE` to override the default SQLite location.

## Quick start

```bash
npm install
npm run dev   # builds domain, starts API + web, opens http://127.0.0.1:5173
```

Or run the pieces separately: `npm run dev:server` (API on `http://127.0.0.1:8787`) and
`npm run dev:web` (UI on `http://127.0.0.1:5173`).

### Optional login (VPS / remote)

Login is **off** by default. On the home screen, enable it and set a password — coactl writes a
one-way **scrypt hash** to `~/.coactl/auth.json` (mode `600`). No `.env` password.

When enabled, the UI shows an Unlock screen and all `/api/*` routes (except health / auth) require
a session cookie.

## Production API and UI

Build all workspaces, then start the production API:

```bash
npm run build
npm run start
```

The root `start` command rebuilds the domain and server before starting the API. It does not serve
`apps/web/dist`: host the built web directory separately (or run `npm run dev:web` / the web
preview command for non-production use) and proxy `/api` to the API.

For a VPS, enable login while bound to localhost first, then re-bind beyond localhost:

```bash
COACTL_HOST=0.0.0.0 COACTL_PORT=8787 npm run start
```

The defaults are `COACTL_HOST=127.0.0.1` and `COACTL_PORT=8787`. Prefer HTTPS via a reverse
proxy, keep the API and static UI on the same trusted origin, and run the process as a locked-down
OS user.

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
| GET/PUT | `/api/profile` | Read or update the SQLite-backed portable profile |
| GET | `/api/profile/export` | Export a versioned profile document without credentials |
| POST | `/api/profile/import` | Preview or apply a portable profile import |
| GET | `/api/skills?tool=&scope=` | List skills (one row per physical path, `readOnly` flag) |
| GET/PUT/DELETE | `/api/skills/:tool/:id?scope=&path=` | Read / update / delete (optional `path` picks a duplicate) |
| POST | `/api/skills` | Create (always the preferred writable dir) |
| POST | `/api/skills/scaffold` | Scaffold (+ save) |
| POST | `/api/skills/import` | Copy to other tools/scopes (`dryRun: true` previews) |
| POST | `/api/skills/remote/git/preview` | Shallow-clone URL and list `SKILL.md` candidates |
| POST | `/api/skills/remote/pack/preview` | Pack/download npm or archive source and list `SKILL.md` candidates |
| POST | `/api/skills/remote/preview` | Detect GitHub/Git/npm/archive source and preview skills |
| POST | `/api/skills/remote/git/install` | Write selected remote skills (`dryRun` previews) |
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
| GET | `/api/auth/status` | Whether login is enabled / session unlocked |
| POST | `/api/auth/enable` | Enable login + store password hash |
| POST | `/api/auth/login` | Unlock (sets httpOnly session cookie) |
| POST | `/api/auth/logout` | Clear session |
| POST | `/api/auth/disable` | Disable login (password required) |
| POST | `/api/auth/password` | Change password |

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
apps/server/       Hono API (default 127.0.0.1; `COACTL_HOST` to bind elsewhere)
packages/domain/   detection, skill/rule IO, import
```

## Releases

### 0.3.0

Phases A–C complete: Skills/Rules/Commands/Workflows, import overwrite diffs, git skill install,
optional VPS login (`~/.coactl/auth.json`), kind switcher, empty-state paths, list hotkeys,
draft recovery, and undo delete.

## License

MIT
