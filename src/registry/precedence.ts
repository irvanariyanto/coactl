import type { LoadedAsset } from "../sources/types.js";
import type { Manifest } from "../schema/index.js";

// Sources listed in resolution.precedence rank by their index (lower = higher priority).
// Sources not listed rank after all listed ones, preserving their original load order.
export function pickWinnerByPrecedence(candidates: LoadedAsset[], manifest: Manifest): LoadedAsset {
  const order = manifest.resolution.precedence;
  const ranked = [...candidates].sort((a, b) => {
    const ai = order.indexOf(a.sourceName);
    const bi = order.indexOf(b.sourceName);
    const ar = ai === -1 ? Infinity : ai;
    const br = bi === -1 ? Infinity : bi;
    if (ar !== br) return ar - br;
    return candidates.indexOf(a) - candidates.indexOf(b);
  });
  return ranked[0];
}
