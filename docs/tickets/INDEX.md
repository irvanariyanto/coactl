# AgentCtl — Execution Tickets

Derived from [`docs/PRD.md`](../PRD.md) and [`CLAUDE.md`](../../CLAUDE.md). Each ticket is self-contained and ready to execute: scope, target files, and acceptance criteria.

**Ticket ID format:** `AC-<NNN>`. Dependencies are hard (must merge before starting).

## Conventions (apply to every ticket)
- TypeScript, Node ≥ 20, ESM. Validate YAML with `zod`. CLI via `commander`.
- Adapter format logic stays isolated in `src/adapters/`. Never edit generated files from logic — always regenerate from the resolved registry.
- All generation MUST be idempotent (re-running `sync` yields byte-identical output).
- Every ticket lands with unit tests and a green `npm test` + `npm run build`.
- When a kind can't map to a target, emit a warning — never silently drop.

## Milestone map

| Phase | Tickets |
|-------|---------|
| M0 — Bootstrap | AC-001 |
| M1 — Schema + validator + `add` | AC-002, AC-003, AC-004 |
| M2 — Local source + Claude/Cursor adapters + `sync` | AC-005, AC-006, AC-007, AC-008, AC-009, AC-010, AC-011 |
| M3 — Multi-source + install + lockfile | AC-012, AC-013, AC-014 |
| M4 — Overrides + precedence + `why`/`status` | AC-015, AC-016, AC-017, AC-018 |
| M5 — Windsurf/Copilot + workflow + `--global` | AC-019, AC-020, AC-021, AC-022 |
| M6 — Canonical sync + Codex | AC-023 |

## Dependency graph (high level)
```
AC-001
  └─ AC-002 ─ AC-003 ─ AC-004
        └─ AC-005 ─ AC-006 ─ AC-007 ─ AC-008
                                   └─ AC-009
                                        └─ AC-010 ─ AC-011
                                                      ├─ AC-012 ─ AC-013 ─ AC-014
                                                      ├─ AC-015 ─ AC-016 ─ AC-017
                                                      │                 └─ AC-018
                                                      └─ AC-019, AC-020, AC-021, AC-022

AC-023 depends on AC-008, AC-011, AC-018, and AC-022.
```

## Ticket list
- [AC-001 — Project bootstrap & CLI skeleton](AC-001-bootstrap.md)
- [AC-002 — Canonical zod schemas](AC-002-schemas.md)
- [AC-003 — Asset validator & error reporting](AC-003-validator.md)
- [AC-004 — `add` command (asset scaffolding)](AC-004-add-command.md)
- [AC-005 — Local source loader](AC-005-local-source.md)
- [AC-006 — Registry resolve & merge (single-source)](AC-006-registry-merge.md)
- [AC-007 — Adapter interface & capability matrix](AC-007-adapter-interface.md)
- [AC-008 — Claude Code adapter](AC-008-claude-adapter.md)
- [AC-009 — Cursor adapter](AC-009-cursor-adapter.md)
- [AC-010 — Transform engine & drift headers](AC-010-transform-engine.md)
- [AC-011 — `sync` & `build` commands (idempotent)](AC-011-sync-build.md)
- [AC-012 — git/url/package source loaders](AC-012-remote-sources.md)
- [AC-013 — `install` with sha256 integrity](AC-013-install.md)
- [AC-014 — Lockfile & `update` command](AC-014-lockfile-update.md)
- [AC-015 — Precedence resolution & conflicts](AC-015-precedence.md)
- [AC-016 — Overrides layer & `override` command](AC-016-overrides.md)
- [AC-017 — `why` command (provenance)](AC-017-why.md)
- [AC-018 — `status` command (drift detection)](AC-018-status.md)
- [AC-019 — Windsurf adapter](AC-019-windsurf-adapter.md)
- [AC-020 — Copilot adapter](AC-020-copilot-adapter.md)
- [AC-021 — Workflow compilation](AC-021-workflow-compile.md)
- [AC-022 — `--global` sync & `explain` command](AC-022-global-explain.md)
- [AC-023 — Canonical asset sync and Codex adapter](AC-023-canonical-sync-codex.md)
