import { execSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { loadAsset } from "../schema/load.js";
import { hashKey } from "./cache.js";
import type { LoadResult, SourceLoader } from "./types.js";
import * as https from "node:https";
import * as http from "node:http";
import * as path from "node:path";

const URL_CACHE_DIR = join(homedir(), ".cache", "coactl", "url");

// Assumption: url source points to a .tar.gz bundle containing assets/ at its root.
export class UrlSource implements SourceLoader {
  constructor(
    private readonly sourceName: string,
    private readonly url: string,
  ) {}

  async load(): Promise<LoadResult> {
    const cacheKey = hashKey(this.url);
    const extractDir = join(URL_CACHE_DIR, cacheKey);

    if (!existsSync(extractDir)) {
      mkdirSync(extractDir, { recursive: true });
      const tarPath = join(URL_CACHE_DIR, `${cacheKey}.tar.gz`);
      await downloadFile(this.url, tarPath);
      execSync(`tar -xzf ${tarPath} -C ${extractDir}`, { stdio: "pipe" });
    }

    return loadAssetsFromDir(this.sourceName, extractDir);
  }
}

function downloadFile(url: string, dest: string): Promise<void> {
  if (url.startsWith("file://")) {
    const srcPath = url.slice("file://".length);
    return import("node:fs").then((fs) => fs.promises.copyFile(srcPath, dest));
  }
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http;
    const file = createWriteStream(dest);
    proto.get(url, (res) => {
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve()));
    }).on("error", reject);
  });
}

async function loadAssetsFromDir(sourceName: string, dir: string): Promise<LoadResult> {
  const assets: LoadResult["assets"] = [];
  const errors: LoadResult["errors"] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const assetDir = join(dir, entry.name);
    if (!existsSync(join(assetDir, "asset.yaml"))) continue;
    try {
      const { asset, bodyText } = loadAsset(assetDir);
      assets.push({ asset, sourceName, origin: { dir: assetDir }, readOnly: true, bodyText });
    } catch (err) {
      errors.push({ dir: assetDir, error: err as Error });
    }
  }

  assets.sort((a, b) => a.asset.id.localeCompare(b.asset.id));
  return { assets, errors };
}
