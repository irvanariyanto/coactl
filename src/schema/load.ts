import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { AssetSchema } from "./asset.js";
import { ManifestSchema } from "./manifest.js";
import { LockfileSchema } from "./lockfile.js";
import { ValidationError, formatZodError } from "./errors.js";
import type { Asset, Manifest, Lockfile } from "./index.js";

function readYaml(path: string): unknown {
  let content: string;
  try {
    content = readFileSync(path, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new ValidationError(path, [{ path: "(file)", message: `File not found: ${path}` }]);
    }
    throw new ValidationError(path, [{ path: "(file)", message: (err as Error).message }]);
  }
  try {
    return parse(content);
  } catch (err) {
    throw new ValidationError(path, [{ path: "(yaml)", message: (err as Error).message }]);
  }
}

export function loadAsset(dir: string): { asset: Asset; dir: string } {
  const resolvedDir = resolve(dir);
  const file = resolve(resolvedDir, "asset.yaml");
  const raw = readYaml(file);

  const result = AssetSchema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(file, formatZodError(result.error));
  }

  const asset = result.data;
  const bodyPath = resolve(resolvedDir, asset.body);
  if (!existsSync(bodyPath)) {
    throw new ValidationError(file, [
      { path: "body", message: `Body file not found: ${bodyPath}` },
    ]);
  }

  return { asset, dir: resolvedDir };
}

export function loadManifest(path: string): Manifest {
  const raw = readYaml(path);
  const result = ManifestSchema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(path, formatZodError(result.error));
  }
  return result.data;
}

export function loadLockfile(path: string): Lockfile {
  const raw = readYaml(path);
  const result = LockfileSchema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(path, formatZodError(result.error));
  }
  return result.data;
}
