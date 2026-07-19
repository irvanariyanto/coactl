# npm/zip skill packs + ops polish — Design

**Date:** 2026-07-19  
**Status:** Approved (conversation) — awaiting spec review before implementation plan  
**Related:** [docs/PRD.md](../../../PRD.md), existing git skill install (`remote-git-skills.ts`, `GitInstallPanel`)

---

## 1. Goal

Let users install **native skills** (`SKILL.md` trees) from:

1. An **npm package** (via `npm pack`, no install scripts)
2. A **zip or tgz archive** (local path or `https://` URL)

Reuse the same preview → select → dry-run → overwrite/diff → write flow as git install.

Also improve **ops**: production-oriented root `start` plus clearer deploy docs (`COACTL_HOST` / `COACTL_PORT`, login-first, reverse proxy).

---

## 2. Non-goals

- Private git auth (SSH agent / PAT storage) — deferred
- Legacy CLI packs (`assets/` + `asset.yaml`) — not supported
- Multi-kind packs (rules/commands/workflows) in v1 — skills only
- Central `.coactl` registry or sync
- GitHub Release creation via `gh` (user publishes via web UI if desired)

---

## 3. Approach

**Reuse the git install pipeline (Approach A).**

Fetch/extract into a temp directory → `scanSkillsInDirectory` → reuse `planInstallRemoteSkills` / `installRemoteSkills` (or equivalent existing helpers) → same install API payload as git apply.

Do **not** duplicate plan/overwrite/diff logic.

---

## 4. Domain

New module (e.g. `packages/domain/src/remote-pack-skills.ts`) exporting:

### 4.1 `previewSkillsFromNpm`

```ts
previewSkillsFromNpm({
  install: string;      // package name / name@version
  registry?: string;    // default https://registry.npmjs.org
  subpath?: string;
  tmpParent?: string;   // tests
  runNpmPack?: ...;     // injectable for tests
}): Promise<{ install; registry; subpath?; skills: RemoteSkillCandidate[] }>
```

Behavior:

- Validate `install` (non-empty; reject shell metacharacters / path escapes; package-spec shape only)
- Create temp dir under `os.tmpdir()`
- Run `npm pack <install> --pack-destination <tmp> --registry <registry>` (no `npm install`)
- Extract the produced `.tgz` (strip package root component as npm pack does)
- `scanSkillsInDirectory(extractRoot, subpath)`
- Always `rmSync` temp dir in `finally`

### 4.2 `previewSkillsFromArchive`

```ts
previewSkillsFromArchive({
  path?: string;        // absolute local path to .zip / .tgz / .tar.gz
  url?: string;         // https:// only
  subpath?: string;
  tmpParent?: string;
  fetchUrl?: ...;       // injectable
}): Promise<{ source: string; subpath?; skills: RemoteSkillCandidate[] }>
```

Behavior:

- Exactly one of `path` or `url` required
- URL: `https://` only; reject other schemes; download to temp file with a size cap (e.g. 50 MiB)
- Path: must exist, be a regular file, extension `.zip` / `.tgz` / `.tar.gz`
- Extract safely (no path traversal outside extract root)
- Scan + cleanup as above

### 4.3 Shared types

Reuse `RemoteSkillCandidate` and install plan/result types from `remote-git-skills.ts` (export already via `@coactl/domain`).

Install apply: **reuse** existing `planInstallRemoteSkills` / `installRemoteSkills` and the existing git install HTTP handler body (`skills[]`, `overwrite`, `dryRun`, tool/scope from query/body).

---

## 5. API

### Preview

`POST /api/skills/remote/pack/preview?root=&scope=`

Body (zod):

```ts
{
  kind: "npm" | "archive";
  // npm
  install?: string;
  registry?: string;
  // archive
  path?: string;
  url?: string;
  // shared
  subpath?: string;
}
```

Response: `{ kind, source, subpath?, skills: RemoteSkillCandidate[] }`  
(`source` = package id or path/url used)

Errors: `400` validation; `502`/`500` with clear message on pack/fetch/extract failure.

### Install

**Reuse** `POST /api/skills/remote/git/install` (same payload: tool, scope, skills contents, overwrite, dryRun).

No separate pack install endpoint — once skills are in memory, source does not matter.

Auth middleware: same as other `/api/*` routes.

---

## 6. UI

On Skills list, extend the remote install area:

- Tabs: **Git | Pack**
- Pack panel fields:
  - Mode toggle: **npm** | **archive**
  - npm: package (`@scope/name` or `name@version`), optional registry URL, optional subpath
  - archive: path **or** HTTPS URL, optional subpath
- Reuse candidate list, selection, overwrite, dry-run plan, side-by-side diff, install actions from `GitInstallPanel` (extract shared bits or thin wrapper to avoid drift)

Busy/error patterns match git install.

---

## 7. Ops polish

Root `package.json` already has `"start": "npm run start -w @coactl/server"`.

Change to a small helper (e.g. `scripts/start.mjs`) that:

1. Builds `@coactl/domain` then `@coactl/server` (web UI is served by Vite in dev; for production note that API-only start is the default unless/until static serving is added — **document current reality**: production API via `start`, UI via built web or `dev:web` behind reverse proxy as today)
2. Starts the server
3. Logs bind address from `COACTL_HOST` / `COACTL_PORT` (defaults `127.0.0.1:8787`) and reminds that optional login should be enabled before binding `0.0.0.0`

Clarify in README:

- Build: `npm run build`
- API: `npm run start` (or env-prefixed)
- Optional login first on localhost, then re-bind
- Prefer TLS reverse proxy in front of `COACTL_HOST=0.0.0.0`

If the server does not yet serve `apps/web/dist`, docs must not claim it does. Prefer documenting API + separate static host / Vite preview rather than inventing full static embedding in this pass unless already trivial — **keep ops scope to start helper + docs**, not a new static file server.

---

## 8. Testing

Domain:

- npm pack path with mocked `runNpmPack` + fixture tarball contents containing `skills/foo/SKILL.md`
- archive zip/tgz extraction + scan
- reject non-https URL, path traversal zip entries, empty install
- size-cap / missing file errors

Server:

- preview route validation (kind mismatches)
- happy path with domain mocks if needed

Manual:

- Preview a public npm package that happens to contain `SKILL.md` (or a local test tarball)
- Install into a writable tool dir with overwrite off/on

---

## 9. PRD / README updates

- PRD non-goals: remove or narrow “npm/zip remote packs”; note native `SKILL.md` packs shipped
- README: Pack install subsection + expanded deploy/start section
- API table: add pack preview; note install reuses git install endpoint

---

## 10. Acceptance

1. User can preview skills from an npm package name without running package lifecycle scripts.
2. User can preview skills from a local `.zip`/`.tgz` or `https://` archive URL.
3. Selected skills dry-run and install into the current tool/scope with the same overwrite semantics as git.
4. Legacy `assets/` packs are ignored (no special mapping).
5. `npm run start` builds domain+server and starts the API with clear host/port/login messaging.
6. README deploy notes match actual behavior.