import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { EmittedFile } from "../adapters/types.js";

export interface WriteSummary {
  written: number;
  unchanged: number;
  errors: Array<{ path: string; error: string }>;
}

// Files that should be merged rather than replaced
export const MANAGED_AGGREGATE_FILES = new Set([
  "CLAUDE.md",
  ".windsurfrules",
  ".github/copilot-instructions.md",
]);

function getManagedBlockMarkers(path: string, assetId: string): { start: string; end: string } {
  return {
    start: `<!-- BEGIN coactl:${assetId} -->`,
    end: `<!-- END coactl:${assetId} -->`,
  };
}

function isManagedFile(path: string): boolean {
  return MANAGED_AGGREGATE_FILES.has(path);
}

function mergeWithManagedBlock(
  existingContent: string | null,
  newContent: string,
  assetId: string,
): string {
  const markers = getManagedBlockMarkers(existingContent ? "." : "", assetId);

  if (!existingContent) {
    return newContent;
  }

  // Remove old block for this asset if it exists
  const startIdx = existingContent.indexOf(markers.start);
  if (startIdx !== -1) {
    const endIdx = existingContent.indexOf(markers.end);
    if (endIdx !== -1) {
      const before = existingContent.substring(0, startIdx);
      const after = existingContent.substring(endIdx + markers.end.length);
      return before + newContent + after;
    }
  }

  // No existing block, just append
  return existingContent + "\n" + newContent;
}

export function writeFiles(files: EmittedFile[], rootDir: string = process.cwd()): WriteSummary {
  const summary: WriteSummary = {
    written: 0,
    unchanged: 0,
    errors: [],
  };

  // Group files by path (multiple assets may emit the same file)
  const filesByPath = new Map<string, EmittedFile[]>();
  for (const file of files) {
    const key = file.path;
    if (!filesByPath.has(key)) {
      filesByPath.set(key, []);
    }
    filesByPath.get(key)!.push(file);
  }

  for (const [path, emittedFiles] of filesByPath.entries()) {
    try {
      const fullPath = resolve(rootDir, path);
      const dir = dirname(fullPath);

      // Create parent directories
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      let content: string;

      if (isManagedFile(path)) {
        // Merge managed blocks
        const existing = existsSync(fullPath) ? readFileSync(fullPath, "utf-8") : null;
        let merged = existing;
        for (const file of emittedFiles) {
          merged = mergeWithManagedBlock(merged, file.contents, file.assetId);
        }
        content = merged || "";
      } else {
        // Single file write (non-managed aggregate files)
        if (emittedFiles.length > 1) {
          throw new Error(`Multiple emitters for non-managed file (expected 1, got ${emittedFiles.length})`);
        }
        content = emittedFiles[0].contents;
      }

      // Check if content changed
      if (existsSync(fullPath)) {
        const existing = readFileSync(fullPath, "utf-8");
        if (existing === content) {
          summary.unchanged++;
          continue;
        }
      }

      // Write file
      writeFileSync(fullPath, content, "utf-8");
      summary.written++;
    } catch (err) {
      summary.errors.push({
        path,
        error: (err as Error).message,
      });
    }
  }

  return summary;
}
