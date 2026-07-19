import Database from "better-sqlite3";
import { chmodSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const SCHEMA_VERSION = 1;
const EXPORT_VERSION = 1;
const MAX_RECENT_PROJECTS = 8;
const databases = new Map<string, Database.Database>();

export interface ProfileState {
  activeProject: string | null;
  recentProjects: string[];
  databasePath: string;
  schemaVersion: number;
}

export interface ProfileExportDocument {
  format: "coactl-profile";
  version: 1;
  exportedAt: string;
  settings: { activeProject: string | null };
  projects: Array<{ path: string; lastOpenedAt: string }>;
}

export function profileDatabasePath(): string {
  return resolve(process.env.COACTL_DB_FILE?.trim() || join(homedir(), ".coactl", "coactl.db"));
}

function openDatabase(): Database.Database {
  const path = profileDatabasePath();
  const cached = databases.get(path);
  if (cached) return cached;
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  chmodSync(path, 0o600);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  databases.set(path, db);
  return db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
  const current = db.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations").get() as {
    version: number;
  };
  if (current.version > SCHEMA_VERSION) {
    throw new Error(`Profile database schema ${current.version} is newer than supported ${SCHEMA_VERSION}`);
  }
  if (current.version < 1) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE settings (
          key TEXT PRIMARY KEY,
          value_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE projects (
          path TEXT PRIMARY KEY,
          last_opened_at TEXT NOT NULL
        );
        CREATE INDEX projects_last_opened_idx ON projects(last_opened_at DESC);
      `);
      db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)").run(1, new Date().toISOString());
    })();
  }
}

function readActiveProject(db: Database.Database): string | null {
  const row = db.prepare("SELECT value_json FROM settings WHERE key = 'activeProject'").get() as
    | { value_json: string }
    | undefined;
  if (!row) return null;
  try {
    const value = JSON.parse(row.value_json) as unknown;
    return typeof value === "string" && value.trim() ? value : null;
  } catch {
    return null;
  }
}

export function getProfileState(): ProfileState {
  const db = openDatabase();
  const projects = db
    .prepare("SELECT path FROM projects ORDER BY last_opened_at DESC LIMIT ?")
    .all(MAX_RECENT_PROJECTS) as Array<{ path: string }>;
  return {
    activeProject: readActiveProject(db),
    recentProjects: projects.map((project) => project.path),
    databasePath: profileDatabasePath(),
    schemaVersion: SCHEMA_VERSION,
  };
}

export function saveProfileState(input: {
  activeProject?: string | null;
  recentProjects?: string[];
}): ProfileState {
  const db = openDatabase();
  const now = new Date().toISOString();
  const active = input.activeProject === undefined ? undefined : input.activeProject?.trim() || null;
  const effectiveActive = active === undefined ? readActiveProject(db) : active;
  let recentProjects = input.recentProjects;
  if (effectiveActive && recentProjects) {
    recentProjects = [effectiveActive, ...recentProjects.filter((path) => path !== effectiveActive)];
  } else if (active) {
    recentProjects = [active, ...getProfileState().recentProjects.filter((path) => path !== active)];
  }
  db.transaction(() => {
    if (input.activeProject !== undefined) {
      db.prepare(
        `INSERT INTO settings(key, value_json, updated_at) VALUES ('activeProject', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
      ).run(JSON.stringify(active), now);
    }
    if (recentProjects) {
      const unique = [...new Set(recentProjects.map((path) => path.trim()).filter(Boolean))].slice(
        0,
        MAX_RECENT_PROJECTS,
      );
      const upsert = db.prepare(
        `INSERT INTO projects(path, last_opened_at) VALUES (?, ?)
         ON CONFLICT(path) DO UPDATE SET last_opened_at = excluded.last_opened_at`,
      );
      unique.forEach((path, index) => upsert.run(path, new Date(Date.now() - index).toISOString()));
      if (unique.length) {
        const placeholders = unique.map(() => "?").join(",");
        db.prepare(`DELETE FROM projects WHERE path NOT IN (${placeholders})`).run(...unique);
      } else {
        db.prepare("DELETE FROM projects").run();
      }
    }
  })();
  return getProfileState();
}

export function exportProfile(): ProfileExportDocument {
  const db = openDatabase();
  const projects = db
    .prepare("SELECT path, last_opened_at AS lastOpenedAt FROM projects ORDER BY last_opened_at DESC")
    .all() as Array<{ path: string; lastOpenedAt: string }>;
  return {
    format: "coactl-profile",
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    settings: { activeProject: readActiveProject(db) },
    projects,
  };
}

export function validateProfileDocument(value: unknown): ProfileExportDocument {
  if (!value || typeof value !== "object") throw new Error("Profile document must be an object");
  const doc = value as Partial<ProfileExportDocument>;
  if (doc.format !== "coactl-profile") throw new Error("Unsupported profile format");
  if (doc.version !== EXPORT_VERSION) {
    throw new Error(`Unsupported profile version: ${String(doc.version)}`);
  }
  if (!doc.settings || (doc.settings.activeProject !== null && typeof doc.settings.activeProject !== "string")) {
    throw new Error("Profile settings are invalid");
  }
  if (!Array.isArray(doc.projects)) throw new Error("Profile projects must be an array");
  if (doc.projects.length > MAX_RECENT_PROJECTS) {
    throw new Error(`Profile contains more than ${MAX_RECENT_PROJECTS} recent projects`);
  }
  const seen = new Set<string>();
  const projects = doc.projects.map((project) => {
    if (!project || typeof project.path !== "string" || !project.path.trim()) {
      throw new Error("Profile contains an invalid project path");
    }
    if (typeof project.lastOpenedAt !== "string" || Number.isNaN(Date.parse(project.lastOpenedAt))) {
      throw new Error(`Profile project has an invalid timestamp: ${project.path}`);
    }
    const path = project.path.trim();
    if (seen.has(path)) throw new Error(`Profile contains a duplicate project path: ${path}`);
    seen.add(path);
    return { path, lastOpenedAt: project.lastOpenedAt };
  });
  const activeProject = doc.settings.activeProject?.trim() || null;
  if (activeProject && !seen.has(activeProject)) {
    throw new Error("Active project must also appear in the recent projects list");
  }
  return {
    format: "coactl-profile",
    version: 1,
    exportedAt: typeof doc.exportedAt === "string" ? doc.exportedAt : new Date(0).toISOString(),
    settings: { activeProject },
    projects,
  };
}

export function previewProfileImport(value: unknown): {
  activeProject: string | null;
  projects: Array<{ path: string; exists: boolean; action: "add" | "update" | "remove" }>;
} {
  const doc = validateProfileDocument(value);
  const db = openDatabase();
  const existing = new Set(
    (db.prepare("SELECT path FROM projects").all() as Array<{ path: string }>).map((row) => row.path),
  );
  const incoming = new Set(doc.projects.map((project) => project.path));
  const removals = [...existing]
    .filter((path) => !incoming.has(path))
    .sort()
    .map((path) => ({ path, exists: true, action: "remove" as const }));
  return {
    activeProject: doc.settings.activeProject,
    projects: [
      ...doc.projects.map((project) => ({
        path: project.path,
        exists: existing.has(project.path),
        action: existing.has(project.path) ? ("update" as const) : ("add" as const),
      })),
      ...removals,
    ],
  };
}

export function importProfile(value: unknown): ProfileState {
  const doc = validateProfileDocument(value);
  const db = openDatabase();
  db.transaction(() => {
    db.prepare("DELETE FROM projects").run();
    const upsert = db.prepare(
      `INSERT INTO projects(path, last_opened_at) VALUES (?, ?)
       ON CONFLICT(path) DO UPDATE SET last_opened_at = excluded.last_opened_at`,
    );
    for (const project of doc.projects) upsert.run(project.path, project.lastOpenedAt);
    db.prepare(
      `INSERT INTO settings(key, value_json, updated_at) VALUES ('activeProject', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
    ).run(JSON.stringify(doc.settings.activeProject), new Date().toISOString());
  })();
  return getProfileState();
}
