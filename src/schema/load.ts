import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { AssetSchema, SEMVER_REGEX, ScopeSchema, TriggerSchema, StepSchema, ASSET_KINDS, SUPPORTED_TARGETS } from "./asset.js";
import { ManifestSchema } from "./manifest.js";
import { LockfileSchema } from "./lockfile.js";
import { ValidationError, formatZodError } from "./errors.js";
import { z } from "zod";
import type { Asset, Manifest, Lockfile } from "./index.js";
import type { AssetKind } from "./asset.js";

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

function splitFrontmatter(content: string): { fm: string; body: string } | null {
  // Strip coactl HTML comment header if present
  const stripped = content.replace(/^<!--[\s\S]*?-->\n*/, "").trimStart();
  const match = stripped.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;
  return { fm: match[1], body: match[2].trimStart() };
}

const ClaudeFrontmatterSchema = z.object({
  name: z.string(),
  version: z.string().regex(SEMVER_REGEX, "version must be a valid semver string"),
  description: z.string(),
  activation: z.enum(["auto", "manual", "agent-requested"]),
  kind: z.enum(ASSET_KINDS).optional(),
  invocation: z.string().optional(),
  scope: ScopeSchema.optional(),
  triggers: z.array(TriggerSchema).optional(),
  steps: z.array(StepSchema).optional(),
  targets: z.array(z.enum(SUPPORTED_TARGETS)),
  priority: z.number().int().optional(),
});

/**
 * Loads a Claude Code format asset file (SKILL.md, commands/{id}.md, rules/{id}.md).
 * Returns null if the file is not a coactl-managed asset (no frontmatter or no `targets` field).
 * Throws ValidationError if the file looks like a coactl asset but has invalid structure.
 */
export function loadClaudeFormat(
  filePath: string,
  id: string,
  kindHint: AssetKind,
): { asset: Asset; bodyText: string } | null {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }

  const parts = splitFrontmatter(content);
  if (!parts) return null;

  let rawFm: unknown;
  try {
    rawFm = parse(parts.fm);
  } catch (err) {
    throw new ValidationError(filePath, [{ path: "(yaml)", message: (err as Error).message }]);
  }

  // Not a coactl asset — skip silently
  if (!rawFm || typeof rawFm !== "object" || !("targets" in rawFm)) return null;

  const fmResult = ClaudeFrontmatterSchema.safeParse(rawFm);
  if (!fmResult.success) {
    throw new ValidationError(filePath, formatZodError(fmResult.error));
  }
  const fm = fmResult.data;

  let kind: AssetKind = kindHint;
  if (kindHint === "command") {
    kind = fm.kind ?? (fm.steps ? "workflow" : "command");
  }

  const assetData = {
    id,
    kind,
    name: fm.name,
    version: fm.version,
    description: fm.description,
    activation: fm.activation,
    targets: fm.targets,
    ...(fm.invocation !== undefined && { invocation: fm.invocation }),
    ...(fm.scope !== undefined && { scope: fm.scope }),
    ...(fm.triggers !== undefined && { triggers: fm.triggers }),
    ...(fm.steps !== undefined && { steps: fm.steps }),
    ...(fm.priority !== undefined && { priority: fm.priority }),
  };

  const assetResult = AssetSchema.safeParse(assetData);
  if (!assetResult.success) {
    throw new ValidationError(filePath, formatZodError(assetResult.error));
  }

  return { asset: assetResult.data, bodyText: parts.body };
}

export function loadAsset(dir: string): { asset: Asset; dir: string; bodyText: string } {
  const resolvedDir = resolve(dir);
  const file = resolve(resolvedDir, "asset.yaml");
  const raw = readYaml(file);

  const result = AssetSchema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(file, formatZodError(result.error));
  }

  const asset = result.data;
  const bodyPath = resolve(resolvedDir, asset.body!);
  if (!existsSync(bodyPath)) {
    throw new ValidationError(file, [
      { path: "body", message: `Body file not found: ${bodyPath}` },
    ]);
  }

  const bodyText = readFileSync(bodyPath, "utf-8");
  return { asset, dir: resolvedDir, bodyText };
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
