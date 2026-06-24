# AC-023 — Canonical asset sync and Codex adapter

**Milestone:** M6 (cross-tool canonical registry)
**Depends on:** AC-008, AC-011, AC-018, AC-022
**Blocks:** Future target-adapter plugins

## Goal
Make Coactl the explicit, canonical registry for reusable AI-agent assets: import or author an asset once, then compile it to every selected compatible target.

Claude Code remains the **first-class reference target**. Its adapter must continue to support `skill`, `command`, `rule`, and `workflow` natively. Codex is the first new first-class target in this milestone.

## Product contract

```text
Native tool assets -> explicit coactl import -> canonical registry -> explicit coactl sync -> native tool outputs
```

- Coactl is one-way after import. It never silently imports tool changes or resolves bidirectional conflicts.
- `sync` writes all selected, compatible canonical assets. It reports every degraded or unsupported mapping.
- `sync --strict` exits non-zero when a selected asset cannot map natively.
- `sync --prune` removes only stale Coactl-managed output; it never deletes unmanaged user content.
- Project and global scopes remain strictly separate.

## Scope

### 1. Preserve Claude Code as the reference target
- Keep `claude-code` first in `SUPPORTED_TARGETS` and in interactive target selection.
- Keep all four asset kinds `native` in the capability matrix.
- Retain existing Claude Code paths and front matter unless a failing compatibility test proves a correction is required.
- Add an explicit regression test covering all four canonical kinds through the Claude adapter.

### 2. Add Codex as a first-class target
- Add `codex` to the target schema, target hints, capability matrix, transform engine, CLI filters, and documentation.
- Add `CodexAdapter implements Adapter` in `src/adapters/codex.ts`.
- Support native Codex skills in both scopes:
  - project: `.agents/skills/<id>/SKILL.md`
  - global: `~/.agents/skills/<id>/SKILL.md`
- Support Codex rules as managed instruction blocks:
  - project: `AGENTS.md`
  - global: `~/.codex/AGENTS.md` (or `$CODEX_HOME/AGENTS.md` when configured)
  - preserve content not enclosed in `<!-- BEGIN coactl:<id> -->` / `<!-- END coactl:<id> -->` markers.
- Map `command` to a global Codex prompt at `~/.codex/prompts/<id>.md` as a **degraded** compatibility path. For project scope, skip with a diagnostic because Codex custom prompts are user-scoped.
- Mark `workflow` as `skip` in v1, with a diagnostic that recommends a Codex skill. Do not invent unsupported workflow semantics.
- Generate byte-stable output with drift headers, managed markers where appropriate, and trailing newlines.

### 3. Pass sync scope to adapters
- Introduce an adapter context or equivalent output-path resolver so an adapter can select different project and global paths without relying on ambient process state.
- Replace the current single `rootDir` global strategy where it cannot represent target-specific paths correctly.
- Respect `CODEX_HOME` for Codex configuration files; use the documented user skill location for global skills.

### 4. Implement managed-output pruning
- Add `coactl sync --prune`.
- Discover stale Coactl-owned output from drift headers and managed-block markers, then remove only output not present in the resolved registry for the selected scope and targets.
- For aggregate files, remove stale managed blocks and retain all unmanaged content.
- For standalone files, delete only files proven to be Coactl-owned. Never recursively delete a target directory.
- Report every pruned path and support a dry-run preview.

### 5. Make compatibility visible
- Extend `coactl explain <id>` to show Codex capability, scope-specific path, degradation, and skip reasons.
- Add `sync --strict`; warnings become a non-zero result when the selected target cannot provide native behavior.
- Update README compatibility tables and global-setup examples to include Codex and distinguish native, degraded, and skipped mappings.

## Non-goals
- Bidirectional live synchronization or automatic reconciliation of edits made in Claude, Codex, Cursor, or other tools.
- Treating every tool as behaviorally identical.
- Plugin-based third-party target adapters. This ticket should keep the adapter boundary clean enough for that later work.
- Automatic migration of existing user-owned Codex guidance into Coactl-managed blocks.

## Target files

```text
src/adapters/codex.ts
src/adapters/capability-matrix.ts
src/adapters/types.ts
src/cli/commands/sync.ts
src/cli/commands/explain.ts
src/cli/index.ts
src/io/global-paths.ts
src/io/write-files.ts
src/registry/drift.ts
src/schema/asset.ts
src/transform/engine.ts
README.md
test/adapters/claude-code.test.ts
test/adapters/codex.test.ts
test/cli/sync.global.test.ts
test/cli/sync.prune.test.ts
test/io/write-files.test.ts
test/registry/drift.test.ts
```

## Acceptance criteria

- [x] `coactl import --from claude --all --global` produces canonical assets that can be synced to Claude Code and Codex without manual rewriting.
- [x] `coactl sync --target codex --global` writes skills to `~/.agents/skills`, rules to the Codex global instruction file, and supported commands to Codex prompts.
- [x] `coactl sync --target codex` writes project skills and rules only to their documented project locations.
- [x] Codex rules preserve unmanaged content in `AGENTS.md` and `~/.codex/AGENTS.md`.
- [x] Codex commands and workflows produce explicit degraded/skip diagnostics; `--strict` exits non-zero for them.
- [x] `coactl sync --prune` removes stale Coactl-managed files and blocks without deleting user-managed content.
- [x] Claude Code remains the first listed target and retains native mappings for all four asset kinds.
- [x] `coactl explain <id>` displays Claude Code and Codex mappings, paths, capabilities, and diagnostics.
- [x] Project and global sync remain isolated and idempotent.
- [x] `npm test`, `npm run lint`, and `npm run build` pass.

## References

- Codex skills: <https://developers.openai.com/codex/skills>
- Codex `AGENTS.md` discovery: <https://developers.openai.com/codex/guides/agents-md>
- Codex custom prompts: <https://developers.openai.com/codex/custom-prompts>
