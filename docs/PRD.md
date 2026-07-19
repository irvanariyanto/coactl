# coactl — Product Requirements Document (PRD)

**Version:** 0.2.1 (as-built, Phase A shipped)  
**Status:** Living document — as-built product plus agreed next priorities  
**Last updated:** 2026-07-18  
**Related:** [README.md](../README.md) · Legacy CLI frozen at tag `cli-v0.1.0` / branch `archive/cli-v0.1`

---

## 1. Summary

**coactl** is a **local-only web app** that helps developers discover installed AI coding tools and manage their **native skills** in place — without a central `.coactl` registry.

**Positioning:** manage native skills across AI coding tools, with a clear **Global vs Project** split (not “define once, sync everywhere” from the legacy CLI).

Users pick **Global** or **Project** mode, drill into a tool, manage skills (CRUD), and **import** skills across tools and across global ↔ project scopes.

> Product pivot: the original CLI synced a canonical `.coactl/` store into many tool formats. The web product instead treats each tool’s native `skills/` directory as the source of truth.

---

## 2. Problem

Developers use multiple AI coding assistants (Claude Code, Cursor, Codex, Gemini, etc.). Each stores skills in different paths and formats. Today that means:

- Skills are duplicated or drift across tools
- It is hard to see **where** a skill lives on disk
- Moving a skill from global → project (or tool A → tool B) is manual and error-prone
- Project vs user-level configuration is easy to confuse

---

## 3. Goals

1. Make **Global vs Project** skill management obvious and separate.
2. **Detect** skill-capable tools from real install/config locations.
3. **Show resolved filesystem paths** so users always know where resources live.
4. Support **CRUD** for skills in each tool’s native folder (`…/skills/<id>/SKILL.md`).
5. Support **import/copy** across tools and across scopes without reformatting file contents.
6. Stay **local and private**: bind to localhost; no cloud account required.
7. Make import **trustworthy** (preview before overwrite; clear duplicate handling).

### Non-goals (current release / near-term)

- Central registry / `.coactl` canonical store
- Full multi-kind parity (rules, commands, workflows) before skills polish is done
- Remote skill packs (git/npm/url sources) from the legacy CLI
- Multi-user SaaS / remote hosting
- Editing non-skill resources (rules, AGENTS.md aggregates, etc.) until Phase B

---

## 4. Users & jobs to be done

| Persona | Job |
|---------|-----|
| Individual developer | Keep personal (global) skills in sync across Claude, Cursor, Codex, etc. |
| Project lead | Maintain project-scoped skills inside a repo for the team’s AI tools |
| Power user | Copy a global skill into a project (or reverse) for one or many tools |

---

## 5. Product principles

1. **Native first** — never invent a parallel store; write where tools already read.
2. **Scope first** — Global and Project are top-level modes, not filters on a mixed list.
3. **Paths visible** — every screen that lists tools/resources shows the resolved path.
4. **Detect from valid sources** — path candidates come from env vars + observed official locations; prefer existing dirs on disk.
5. **Safe copy** — import preserves raw `SKILL.md` contents; overwrite is opt-in and previewed.
6. **Skills-done before breadth** — polish skills UX before shipping Rules / Commands / Workflows.
7. **Vendor dirs are constrained** — some locations are readable/importable but not writable (see §13).

---

## 6. As-built user experience

### 6.1 Primary flow

```
Home
  ├─ Global ──────────────────────────────┐
  │                                       │
  └─ Project → (root required; continue   │
       current or pick recent/Browse) ────┤
                                          ▼
                                       Tools
                                          ▼
                                    Skills list
                              (bulk delete / import)
                                          ▼
                                   Skill detail
                              (edit / delete / import)

Optional deep link: Tools → Resources hub
(Rules/Commands/Workflows = Phase B; primary UI soft-skips to Skills)
```

### 6.2 Modes

| Mode | Entry | Tools listed | Skills listed |
|------|-------|--------------|---------------|
| **Global** | Immediate | Skill-capable tools **installed** on the machine | Global skill dirs only |
| **Project** | Must set project directory | Tools **present in project** (config/skills folders); optional “show all installed” | Project skill dirs only |

### 6.3 Screens (as-built)

| Screen | Requirements |
|--------|----------------|
| Mode home | Two clear choices: Global / Project |
| Project gate | Prefer **Continue** on the active root; recent projects secondary; typed path + Browse for new folders; persist root + up to 8 recents in `localStorage` |
| Tools | Cards with skill count, primary path (+N alternates hint), installed / in-project / path-ok badges; click opens **Skills** (soft-skip Resources) |
| Resources | Optional hub (`#/{mode}/{tool}`) for Phase B kinds; Skills enabled; others “Coming soon”; collapsible scanned paths |
| Skills list | Card grid with filter; one path banner + collapsible candidates; inline create; multi-select bulk delete / import (shared preview panel with overwrite diff) |
| Skill detail | Edit full `SKILL.md`; save/delete; same import panel as bulk (preview → apply, View diff on overwrite) |

### 6.4 Navigation

- Drill-down with breadcrumb (e.g. `Home / Global / Claude Code / Skills / review-pr`)
- “Change mode” returns to mode home
- Views are encoded in the URL hash: refresh, back/forward, and deep links restore the screen
- Unsaved editor changes prompt before in-app navigation or tab close

### 6.5 UX polish requirements (Phase A — **shipped in 0.2.1**)

These closed known friction in the as-built product:

| ID | Requirement | Rationale | Status |
|----|-------------|-----------|--------|
| A1 | **Native folder picker** for project root (OS dialog via `POST /api/pick-folder`), typed path remains as fallback | Typed paths are error-prone | ✅ Done |
| A2 | In **Global** mode, hide project destination paths in Import until a project root is set; show a short CTA to set root | Avoid confusing unresolved/`cwd`-relative project paths | ✅ Done |
| A3 | Mark Cursor **`skills-cursor`** (and similar vendor trees) as **read-only**: list + import-from allowed; create/update/delete/import-to blocked in UI and API (`403`) | Prevent writing into vendor-managed skill trees | ✅ Done |
| A4 | **Duplicate skill ids** across candidate dirs for the same tool+scope: one row per physical path (path column), do not silently merge | “First wins” feels magical | ✅ Done |
| A5 | **Import preview** before apply: per target show path, exists?, action (`write` / `skip` / `overwrite` / `error`); existing contents returned for overwrite targets | Import is a core feature; must feel safe | ✅ Done (diff UI = Phase C) |
| A6 | Single `npm run dev` that starts API + web and opens the browser | Reduce stale-server / split-terminal friction | ✅ Done |
| A7 | Align package/`README` positioning copy with this PRD (native skills, Global vs Project) | Avoid legacy CLI messaging | ✅ Done |

---

## 7. Functional requirements

### 7.1 Tool detection — **Implemented**

- Detect skill-capable tools: `claude-code`, `codex`, `cursor`, `antigravity`, `gemini`, `opencode`, `zed`
- Detection signals: PATH commands and/or known config directories
- Project presence: existence of tool config/skills dirs under the project root
- Per-tool skill path resolution with **candidates** ordered by preference; `path` = first existing candidate else preferred write target; `exists` flag

### 7.2 Skills CRUD — **Implemented**

| Action | Behavior |
|--------|----------|
| List | Scan all candidate dirs for tool+scope; parse `SKILL.md` (YAML frontmatter when valid; otherwise raw) |
| Create | Scaffold under preferred **writable** path: `<skillsDir>/<id>/SKILL.md` |
| Read/Update | Load/save full file contents; if skill already exists in a candidate, update that location (unless read-only) |
| Delete | Remove the skill directory (unless read-only) |

Skill id: kebab-case (`^[a-z0-9]+(-[a-z0-9]+)*$`).

### 7.3 Import — **Implemented** (incl. dry-run preview)

- Copy raw contents from source `{tool, scope, id}` to one or more targets `{tool, scope}`
- Same id on destination
- Skip self-target and existing destination unless `overwrite: true`
- Overwrite into a read-only location returns `error` (never writes)
- Project-scope targets require a project root
- Return per-target status: `written` | `skipped` | `error`
- **Dry run** (`dryRun: true` body flag or `?dryRun=1`): per-target plan `{ filePath, exists, action: write|overwrite|skip|error, reason?, existingContents? }` without writing; the UI requires Preview before Apply

### 7.4 Path transparency — **Implemented**

- Workspace API returns `skillPathsByTool[tool].{project,global}.{path,preferred,exists,candidates}`
- UI surfaces paths on Tools, Resources, Skills list, Create, Import destinations

### 7.5 Duplicate & writability policy — **Implemented**

**Duplicates (same tool + scope + id in multiple candidate dirs):**

- List **one row per physical path** (marked with a `duplicate` badge)
- Editing opens the specific `filePath` the user selected (`path` query param on read/update/delete)
- New creates always go to the **preferred writable** candidate
- Codex project preferred write target: `.agents/skills` (Agent Skills convention); `.codex/skills` remains a scan candidate

**Read-only locations:**

| Location pattern | Read / list | Import from | Write / import to |
|------------------|-------------|-------------|-------------------|
| `…/skills-cursor` (Cursor vendor) | Yes | Yes | **No** |
| Other preferred user skill dirs | Yes | Yes | Yes |

API must reject writes into read-only roots with a clear error.

### 7.6 Future resource kinds — **Phase B (next)**

| Kind | Status |
|------|--------|
| Skills | Done (+ Phase A polish) |
| Rules | Phase B |
| Commands | Phase B |
| Workflows | Phase B |

When added, they must follow the same principles: native paths, Global/Project split, visible paths, import across tools/scopes, duplicate + read-only policy.

---

## 8. Tool path matrix (canonical candidates)

Paths are resolved at runtime; this table documents intended sources of truth.

| Tool | Project candidates | Global candidates |
|------|--------------------|-------------------|
| Claude Code | `<root>/.claude/skills` | `~/.claude/skills` |
| Cursor | `<root>/.cursor/skills`, `…/skills-cursor` (**RO**) | `~/.cursor/skills`, `~/.cursor/skills-cursor` (**RO**) |
| Codex | `<root>/.agents/skills` (preferred write), `<root>/.codex/skills` | `$CODEX_HOME/skills`, `~/.codex/skills`, `~/.agents/skills` |
| Zed | `<root>/.agents/skills` | `$ZED_HOME/skills`, `~/.agents/skills` |
| Gemini | `<root>/.gemini/skills` | `$GEMINI_HOME/skills` |
| OpenCode | `<root>/.opencode/skills` | `$OPENCODE_HOME/skills`, `~/.opencode/skills`, `~/.config/opencode/skills` |
| Antigravity | `<root>/.antigravity/skills` | `$ANTIGRAVITY_HOME/skills` |

Skill file shape: `<skillsDir>/<id>/SKILL.md`.  
(**RO** = read-only / import-from only.)

---

## 9. Architecture

```
Browser (Vite + React)  --HTTP JSON-->  Hono API (127.0.0.1:8787)
                                              |
                                              v
                                       @coactl/domain
                                       - detect tools
                                       - resolve skill paths
                                       - list/save/delete/import skills
                                              |
                                              v
                                         Local filesystem
```

| Package | Responsibility |
|---------|----------------|
| `apps/web` | Drill-down UI |
| `apps/server` | Local REST API, localhost bind only |
| `packages/domain` | Detection, path resolution, skill IO |

**Runtime:** Node ≥ 20, TypeScript ESM monorepo.

**Security defaults:**

- Bind `127.0.0.1` only
- CORS limited to local Vite origins
- Project root provided explicitly by the user (query `root` / env `COACTL_ROOT`)

**DX (shipped):**

- One `npm run dev` (`scripts/dev.mjs`) builds the domain, runs server + web together, and auto-opens `http://127.0.0.1:5173`

---

## 10. API contract (as-built)

Base: `http://127.0.0.1:8787`  
Common query: `root` (absolute project path; used for project scope and path resolution)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/health` | `{ ok, version, focus: "skills" }` |
| GET | `/api/workspace?mode=global\|project&root=` | Tools, counts, resolved paths incl. per-candidate `writable`/`exists` |
| GET | `/api/skills?tool=&scope=` | List skills (one row per physical path; `readOnly` flag) |
| GET | `/api/skills/:tool/:id?scope=&path=` | Read one skill (`path` disambiguates duplicates) |
| POST | `/api/skills` | Create (preferred writable dir) |
| PUT | `/api/skills/:tool/:id` | Update (optional `filePath` targets a duplicate; `403` on read-only) |
| DELETE | `/api/skills/:tool/:id?scope=&path=` | Delete (`403` on read-only) |
| POST | `/api/skills/scaffold` | Scaffold template; optional `save` |
| POST | `/api/skills/import` | Cross-tool / cross-scope copy; `dryRun` returns plan without writing |
| POST | `/api/pick-folder` | Native OS folder dialog; returns absolute path |

### Import request

```json
{
  "source": { "tool": "claude-code", "scope": "global", "id": "review-pr" },
  "targets": [
    { "tool": "cursor", "scope": "global" },
    { "tool": "codex", "scope": "project" }
  ],
  "overwrite": false
}
```

Phase A API additions (dry-run import, writability metadata, `path` disambiguation, folder
picker) are shipped and included in the table above.

---

## 11. Success metrics

| Metric | Target |
|--------|--------|
| Time to find where a skill lives | < 10 seconds from app open |
| Import global skill → another tool | One action from skill detail, no manual copy |
| Path correctness | Resolved path matches real on-disk skill folder when present |
| Safety | No non-localhost bind by default; overwrite never silent |
| Import confidence (Phase A) | User sees preview of write/skip/overwrite before apply |
| Duplicate clarity (Phase A) | Same id in two dirs appears as distinct locations, not one merged row |

Acceptance checks (manual):

1. Global mode lists Claude/Cursor/Codex skills from real home dirs.
2. Project mode requires a directory and lists only project-scoped skills for that tool.
3. Create skill writes `SKILL.md` under the shown path.
4. Import global → project (and reverse) works with overwrite control.
5. UI always shows the path used for the current mode.
6. **Phase A:** `skills-cursor` cannot be written to; import preview shows correct target paths; duplicate ids show both paths.

---

## 12. Roadmap

### Phase A — Skills polish — **✅ shipped in 0.2.1**

Delivered in priority order:

1. **A3** Read-only vendor paths (`skills-cursor`) + API enforcement (`403`)  
2. **A4** Duplicate id handling (one row per physical path; preferred write for creates)  
3. **A5** Import dry-run / preview before apply  
4. **A2** Global mode: project import targets hidden until project root is set  
5. **A1** Native folder picker for project root  
6. **A6 / A7** Unified `npm run dev` + positioning copy cleanup  

Also shipped alongside: full UI redesign (top-bar shell, toasts, scope-colored badges,
full-width editor with ⌘S save, import preview table).

Exit criteria met: skills feel trustworthy for daily Global ↔ Project / cross-tool use.

### Phase B — More resource kinds

1. **Rules** — native rule dirs per tool (highest value after skills)  
2. **Commands** — where tools support slash commands  
3. **Workflows** — Claude-native first  

### Phase C — Nice-to-have

1. Deep links / router — **shipped** (URL hash; soft-skip Resources in primary flow)  
2. Richer diff UI for import overwrite — **partial** (unified View diff on single + bulk overwrite; side-by-side still optional)  
3. Optional revival of legacy remote sources **only** if they still write native dirs (no `.coactl` registry)

Legacy CLI capabilities (lockfile, drift sync from `.coactl`) remain archived unless explicitly revived under native-first constraints.

---

## 13. Decisions (resolved)

| Question | Decision |
|----------|----------|
| Cursor `skills-cursor` writability? | **Read-only** — list & import-from yes; write / import-to no |
| Codex project: `.agents/skills` vs `.codex/skills`? | **Preferred write:** `.agents/skills`. Both scanned. Duplicates listed separately by path |
| Global mode: show project paths before root is set? | **No for import destinations** until project root is set (A2). Tools/resources in Global mode focus on global paths |

---

## 14. Appendix — repository layout

```
coactl/
  apps/web/           # Vite + React UI
  apps/server/        # Hono local API
  packages/domain/    # detect, skill-paths, skills IO
  README.md
  docs/PRD.md         # this document
```

Legacy CLI: `git checkout archive/cli-v0.1` or tag `cli-v0.1.0`.
