import type { ZodError } from "zod";

export interface ValidationIssue {
  path: string;
  message: string;
}

export class ValidationError extends Error {
  constructor(
    public readonly file: string,
    public readonly issues: ValidationIssue[],
  ) {
    super(
      `Validation failed for ${file}:\n${issues.map((i) => `  ${i.path}: ${i.message}`).join("\n")}`,
    );
    this.name = "ValidationError";
  }
}

export function formatZodError(error: ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join(".") || "(root)",
    message: issue.message,
  }));
}
