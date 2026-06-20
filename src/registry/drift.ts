import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { contentHash, parseHeader } from "../transform/header.js";
import { MANAGED_AGGREGATE_FILES } from "../io/write-files.js";
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

// Aggregate files (.windsurfrules, copilot-instructions.md) interleave multiple assets'
// managed blocks in one physical file. Drift must be checked against just this asset's
// own block — comparing the whole file would always read as "modified" once a 2nd asset
// shares the file, since the file then contains content the EmittedFile doesn't expect.
function extractManagedBlock(onDiskFull: string, assetId: string): string | null {
  const fenceStart = `<!-- BEGIN coactl:${assetId} -->`;
  const fenceEnd = `<!-- END coactl:${assetId} -->`;
  const startIdx = onDiskFull.indexOf(fenceStart);
  if (startIdx === -1) return null;
  const endIdx = onDiskFull.indexOf(fenceEnd, startIdx);
  if (endIdx === -1) return null;
  return onDiskFull.slice(startIdx, endIdx + fenceEnd.length);
}

function stripFence(block: string, assetId: string): string {
  return block
    .replace(`<!-- BEGIN coactl:${assetId} -->\n`, "")
    .replace(`\n<!-- END coactl:${assetId} -->`, "");
}

export function checkDrift(emittedFiles: EmittedFile[], rootDir = process.cwd()): DriftEntry[] {
  const results: DriftEntry[] = [];

  for (const file of emittedFiles) {
    const fullPath = resolve(rootDir, file.path);

    if (!existsSync(fullPath)) {
      results.push({ path: file.path, assetId: file.assetId, status: "missing" });
      continue;
    }

    const onDiskFull = readFileSync(fullPath, "utf-8");
    const isAggregate = MANAGED_AGGREGATE_FILES.has(file.path);
    const onDiskBlock = isAggregate ? extractManagedBlock(onDiskFull, file.assetId) : onDiskFull;

    if (onDiskBlock === null) {
      results.push({ path: file.path, assetId: file.assetId, status: "missing" });
      continue;
    }

    if (onDiskBlock === file.contents) {
      results.push({ path: file.path, assetId: file.assetId, status: "clean" });
      continue;
    }

    const onDiskForHeader = isAggregate ? stripFence(onDiskBlock, file.assetId) : onDiskBlock;
    const header = parseHeader(onDiskForHeader);
    if (header) {
      const diskBody = bodyAfterHeader(onDiskForHeader);
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
