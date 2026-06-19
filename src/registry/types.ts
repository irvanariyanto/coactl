import type { Asset } from "../schema/index.js";

export interface Provenance {
  winningSource: string;
  candidates: Array<{ sourceName: string; readOnly: boolean }>;
}

export interface ResolvedAsset {
  asset: Asset;
  sourceName: string;
  readOnly: boolean;
  provenance: Provenance;
}

export interface Registry {
  get(id: string): ResolvedAsset | undefined;
  all(): ResolvedAsset[];
  conflicts: Array<{ id: string; candidates: string[] }>;
}
