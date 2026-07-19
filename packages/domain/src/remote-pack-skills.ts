import { execFile } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { extract as extractTar } from "tar";
import yauzl from "yauzl";
import { scanSkillsInDirectory, type RemoteSkillCandidate } from "./remote-git-skills.js";

const execFileAsync = promisify(execFile);
const DEFAULT_REGISTRY = "https://registry.npmjs.org";
export const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
const PACKAGE_SPEC = /^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)(?:@[a-z0-9][a-z0-9._+-]*)?$/i;

export type NpmPackRunner = (
  args: string[],
  options: { cwd: string },
) => Promise<string | undefined>;

export interface ArchiveFetchResponse {
  ok: boolean;
  status: number;
  url?: string;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type ArchiveFetcher = (url: string) => Promise<ArchiveFetchResponse>;

function cleanSubpath(subpath?: string): string | undefined {
  const value = subpath?.trim();
  if (!value) return undefined;
  if (value.startsWith("/") || value.split(/[\\/]+/).includes("..")) {
    throw new Error("Subpath must stay inside the pack");
  }
  return value;
}

export function assertSafeNpmInstall(install: string): string {
  const value = install.trim();
  if (!value) throw new Error("npm package is required");
  if (!PACKAGE_SPEC.test(value)) {
    throw new Error("npm package must be a package name with an optional version or tag");
  }
  return value;
}

function assertSafeRegistry(registry?: string): string {
  const value = registry?.trim() || DEFAULT_REGISTRY;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Registry must be an http:// or https:// URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Registry must be an http:// or https:// URL");
  }
  return value.replace(/\/+$/, "");
}

function safeDestination(root: string, entryName: string): string {
  const normalized = entryName.replace(/\\/g, "/");
  if (normalized.startsWith("/") || /^[a-z]:\//i.test(normalized)) {
    throw new Error(`Archive entry uses an absolute path: ${entryName}`);
  }
  const destination = resolve(root, normalized);
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
  if (destination !== root && !destination.startsWith(prefix)) {
    throw new Error(`Archive entry escapes the extraction root: ${entryName}`);
  }
  return destination;
}

async function extractTgz(filePath: string, root: string, strip = 0): Promise<void> {
  await extractTar({
    cwd: root,
    file: filePath,
    gzip: true,
    preservePaths: false,
    strict: true,
    strip,
    filter: (entryPath, entry) => {
      safeDestination(root, entryPath.split("/").slice(strip).join("/"));
      if ("type" in entry && (entry.type === "SymbolicLink" || entry.type === "Link")) {
        throw new Error(`Archive links are not supported: ${entryPath}`);
      }
      return true;
    },
  });
}

async function extractZip(filePath: string, root: string): Promise<void> {
  const zip = await new Promise<yauzl.ZipFile>((resolveZip, rejectZip) => {
    yauzl.open(filePath, { lazyEntries: true }, (error, value) => {
      if (error || !value) rejectZip(error ?? new Error("Unable to open zip archive"));
      else resolveZip(value);
    });
  });
  await new Promise<void>((resolvePromise, reject) => {
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      zip.close();
      reject(error);
    };
    zip.on("error", fail);
    zip.on("end", () => {
      if (!settled) {
        settled = true;
        resolvePromise();
      }
    });
    zip.on("entry", (entry) => {
      void (async () => {
        const destination = safeDestination(root, entry.fileName);
        const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
        if ((mode & 0o170000) === 0o120000) {
          throw new Error(`Archive symlinks are not supported: ${entry.fileName}`);
        }
        if (/\/$/.test(entry.fileName)) {
          mkdirSync(destination, { recursive: true });
          zip.readEntry();
          return;
        }
        mkdirSync(dirname(destination), { recursive: true });
        const stream = await new Promise<NodeJS.ReadableStream>((resolveStream, rejectStream) => {
          zip.openReadStream(entry, (error, value) => {
            if (error || !value) rejectStream(error ?? new Error("Unable to read zip entry"));
            else resolveStream(value);
          });
        });
        await pipeline(stream, createWriteStream(destination, { flags: "wx" }));
        zip.readEntry();
      })().catch(fail);
    });
    zip.readEntry();
  });
}

function archiveKind(source: string): "zip" | "tgz" {
  const lower = source.toLowerCase();
  if (lower.endsWith(".zip")) return "zip";
  if (lower.endsWith(".tgz") || lower.endsWith(".tar.gz")) return "tgz";
  throw new Error("Archive must use .zip, .tgz, or .tar.gz");
}

async function extractArchive(filePath: string, source: string, root: string, strip = 0) {
  if (archiveKind(source) === "zip") await extractZip(filePath, root);
  else await extractTgz(filePath, root, strip);
}

async function defaultRunNpmPack(args: string[], options: { cwd: string }): Promise<string> {
  const { stdout } = await execFileAsync("npm", args, {
    cwd: options.cwd,
    maxBuffer: 8 * 1024 * 1024,
  });
  const output = stdout.trim().split(/\r?\n/).filter(Boolean).pop();
  if (!output) throw new Error("npm pack did not produce an archive");
  return output;
}

export interface PreviewNpmSkillsOptions {
  install: string;
  registry?: string;
  subpath?: string;
  tmpParent?: string;
  runNpmPack?: NpmPackRunner;
}

export async function previewSkillsFromNpm(options: PreviewNpmSkillsOptions): Promise<{
  install: string;
  registry: string;
  subpath?: string;
  skills: RemoteSkillCandidate[];
}> {
  const install = assertSafeNpmInstall(options.install);
  const registry = assertSafeRegistry(options.registry);
  const subpath = cleanSubpath(options.subpath);
  const temp = mkdtempSync(join(options.tmpParent ?? tmpdir(), "coactl-npm-"));
  try {
    const output = await (options.runNpmPack ?? defaultRunNpmPack)(
      ["pack", install, "--pack-destination", temp, "--registry", registry, "--ignore-scripts", "--json"],
      { cwd: temp },
    );
    let archivePath: string | undefined;
    if (output) {
      try {
        const parsed = JSON.parse(output) as Array<{ filename?: string }>;
        archivePath = parsed[0]?.filename ? join(temp, basename(parsed[0].filename)) : undefined;
      } catch {
        archivePath = join(temp, basename(output));
      }
    }
    if (!archivePath || !existsSync(archivePath)) {
      archivePath = join(temp, statArchiveName(temp));
    }
    const extractRoot = join(temp, "extract");
    mkdirSync(extractRoot);
    await extractArchive(archivePath, archivePath, extractRoot, 1);
    return { install, registry, subpath, skills: scanSkillsInDirectory(extractRoot, subpath) };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

function statArchiveName(directory: string): string {
  const names = readdirSync(directory).filter((name) => name.endsWith(".tgz"));
  if (names.length !== 1) throw new Error("npm pack did not produce exactly one .tgz archive");
  return names[0]!;
}

export interface PreviewArchiveSkillsOptions {
  path?: string;
  url?: string;
  subpath?: string;
  tmpParent?: string;
  fetchUrl?: ArchiveFetcher;
}

export async function previewSkillsFromArchive(options: PreviewArchiveSkillsOptions): Promise<{
  source: string;
  subpath?: string;
  skills: RemoteSkillCandidate[];
}> {
  const path = options.path?.trim();
  const url = options.url?.trim();
  if (Boolean(path) === Boolean(url)) throw new Error("Provide exactly one archive path or URL");
  const source = path || url!;
  const kind = archiveKind(source);
  const subpath = cleanSubpath(options.subpath);
  const temp = mkdtempSync(join(options.tmpParent ?? tmpdir(), "coactl-pack-"));
  try {
    let archivePath: string;
    if (path) {
      archivePath = resolve(path);
      if (!existsSync(archivePath)) throw new Error(`Archive file not found: ${path}`);
      if (!statSync(archivePath).isFile()) throw new Error(`Archive path is not a regular file: ${path}`);
    } else {
      const parsed = new URL(url!);
      if (parsed.protocol !== "https:") throw new Error("Archive URL must use https://");
      const response = await (options.fetchUrl ?? ((value) => fetch(value)))(url!);
      if (!response.ok) throw new Error(`Archive download failed with HTTP ${response.status}`);
      if (response.url && new URL(response.url).protocol !== "https:") {
        throw new Error("Archive URL redirects must stay on https://");
      }
      const declared = Number(response.headers.get("content-length") ?? 0);
      if (declared > MAX_ARCHIVE_BYTES) throw new Error("Archive exceeds the 50 MiB download limit");
      const data = new Uint8Array(await response.arrayBuffer());
      if (data.byteLength > MAX_ARCHIVE_BYTES) throw new Error("Archive exceeds the 50 MiB download limit");
      archivePath = join(temp, `download.${kind === "zip" ? "zip" : "tgz"}`);
      writeFileSync(archivePath, data);
    }
    const extractRoot = join(temp, "extract");
    mkdirSync(extractRoot);
    await extractArchive(archivePath, source, extractRoot);
    return { source, subpath, skills: scanSkillsInDirectory(extractRoot, subpath) };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
