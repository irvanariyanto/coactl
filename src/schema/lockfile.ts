import { z } from "zod";

const INTEGRITY_REGEX = /^sha256-[a-f0-9]{64}$/;

export const LockfileEntrySchema = z.object({
  source: z.string(),
  version: z.string().optional(),
  commit: z.string().optional(),
  integrity: z.string().regex(INTEGRITY_REGEX, "integrity must match sha256-<64 hex chars>"),
});
export type LockfileEntry = z.infer<typeof LockfileEntrySchema>;

export const LockfileSchema = z.object({
  assets: z.record(z.string(), LockfileEntrySchema),
});
export type Lockfile = z.infer<typeof LockfileSchema>;
