import { dirname, resolve } from "node:path";
import { loadManifest } from "../schema/load.js";
import { LocalSource } from "./local.js";
import { GitSource } from "./git.js";
import { UrlSource } from "./url.js";
import { PackageSource } from "./package.js";
import type { SourceLoader } from "./types.js";

export function buildSourceLoaders(manifestPath = "./agent.manifest.yaml"): SourceLoader[] {
  const manifest = loadManifest(resolve(manifestPath));
  const manifestDir = dirname(resolve(manifestPath));

  return manifest.sources.map((source) => {
    if (source.type === "local") {
      return new LocalSource(source.name, resolve(manifestDir, source.path));
    }
    if (source.type === "git") {
      return new GitSource(source.name, source.url, source.ref, source.subdir);
    }
    if (source.type === "url") {
      return new UrlSource(source.name, source.url);
    }
    if (source.type === "package") {
      return new PackageSource(source.name, source.registry, source.install);
    }
    // org source type implemented in a future ticket
    throw new Error(`Source type "${source.type}" is not yet implemented`);
  });
}
