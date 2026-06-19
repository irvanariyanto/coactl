import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Canonicalization: sorted file list (relative paths) + concatenated contents.
// This ensures identical assets produce identical hashes across machines.
function collectFiles(dir: string, base = dir): Array<{ path: string; content: string }> {
  const result: Array<{ path: string; content: string }> = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      result.push(...collectFiles(full, base));
    } else {
      result.push({ path: relative(base, full), content: readFileSync(full, "utf-8") });
    }
  }
  return result;
}

export function canonicalBytes(assetDir: string): string {
  const files = collectFiles(assetDir);
  return files.map((f) => `${f.path}\n${f.content}`).join("\n---\n");
}

export function computeIntegrity(assetDir: string): string {
  const canonical = canonicalBytes(assetDir);
  return "sha256-" + createHash("sha256").update(canonical).digest("hex");
}

export function verifyIntegrity(assetDir: string, expected: string): boolean {
  return computeIntegrity(assetDir) === expected;
}
