import type { Asset } from "../schema/index.js";

export interface LoadedAsset {
  asset: Asset;
  sourceName: string;
  origin: { dir: string };
  readOnly: boolean;
  bodyText: string;
}

export interface LoadResult {
  assets: LoadedAsset[];
  errors: Array<{ dir: string; error: Error }>;
}

export interface SourceLoader {
  load(): Promise<LoadResult>;
}
