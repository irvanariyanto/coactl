export type DiagnosticLevel = "warn" | "notice";

export interface Diagnostic {
  level: DiagnosticLevel;
  assetId: string;
  target: string;
  kind: string;
  message: string;
}

export function createDiagnostic(
  level: DiagnosticLevel,
  assetId: string,
  target: string,
  kind: string,
  message: string,
): Diagnostic {
  return { level, assetId, target, kind, message };
}

export function degradedWarning(assetId: string, target: string, kind: string): Diagnostic {
  return createDiagnostic("warn", assetId, target, kind, `${kind} on ${target} is degraded — best-effort output only`);
}

export function skipNotice(assetId: string, target: string, kind: string): Diagnostic {
  return createDiagnostic("notice", assetId, target, kind, `${kind} on ${target} is not supported — skipped`);
}
