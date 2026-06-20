import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { contentHash, parseHeader } from "../transform/header.js";
import type { EmittedFile } from "../adapters/types.js";

export type DriftStatus = "clean" | "modified" | "stale" | "missing";

export interface DriftEntry {
  path: string;
  assetId: string;
  status: DriftStatus;
}

function bodyAfterHeader(contents: string): string {
  // Strip HTML comment header
  const htmlEnd = contents.indexOf("-->\n");
  if (htmlEnd !== -1) return contents.slice(htmlEnd + 4);
  // Strip # or // comment header lines
  const lines = contents.split("\n");
  let i = 0;
  while (i < lines.length && (lines[i].startsWith("# ") || lines[i].startsWith("// "))) i++;
  return lines.slice(i).join("\n");
}

export function checkDrift(emittedFiles: EmittedFile[], rootDir = process.cwd()): DriftEntry[] {
  const results: DriftEntry[] = [];

  for (const file of emittedFiles) {
    const fullPath = resolve(rootDir, file.path);

    if (!existsSync(fullPath)) {
      results.push({ path: file.path, assetId: file.assetId, status: "missing" });
      continue;
    }

    const onDisk = readFileSync(fullPath, "utf-8");

    if (onDisk === file.contents) {
      results.push({ path: file.path, assetId: file.assetId, status: "clean" });
      continue;
    }

    const header = parseHeader(onDisk);
    if (header) {
      const diskBody = bodyAfterHeader(onDisk);
      const diskHash = contentHash(diskBody);
      if (diskHash !== header.hash) {
        results.push({ path: file.path, assetId: file.assetId, status: "modified" });
      } else {
        results.push({ path: file.path, assetId: file.assetId, status: "stale" });
      }
    } else {
      results.push({ path: file.path, assetId: file.assetId, status: "modified" });
    }
  }

  return results;
}
