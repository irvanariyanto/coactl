import { dirname, resolve } from "node:path";
import { loadManifest } from "../schema/load.js";
import { LocalSource } from "./local.js";
import type { SourceLoader } from "./types.js";

export function buildSourceLoaders(manifestPath = "./agent.manifest.yaml"): SourceLoader[] {
  const manifest = loadManifest(resolve(manifestPath));
  const manifestDir = dirname(resolve(manifestPath));

  return manifest.sources.map((source) => {
    if (source.type === "local") {
      return new LocalSource(source.name, resolve(manifestDir, source.path));
    }
    // git / url / package / org implemented in AC-012
    throw new Error(`Source type "${source.type}" is not yet implemented (see AC-012)`);
  });
}
