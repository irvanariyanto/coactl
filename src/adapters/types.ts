import type { AssetKind, Target } from "../schema/index.js";
import type { ResolvedAsset } from "../registry/types.js";

export type Capability = "native" | "degraded" | "skip";

export interface EmittedFile {
  path: string;
  contents: string;
  assetId: string;
  target: Target;
}

export interface Adapter {
  target: Target;
  capability(kind: AssetKind): Capability;
  emit(asset: ResolvedAsset): EmittedFile[];
}

export class NoopAdapter implements Adapter {
  constructor(public readonly target: Target) {}
  capability(_kind: AssetKind): Capability { return "skip"; }
  emit(_asset: ResolvedAsset): EmittedFile[] { return []; }
}
