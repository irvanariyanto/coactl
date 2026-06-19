import { z } from "zod";
import { ScopeSchema } from "./asset.js";

const SourceNameSchema = z.string();

const LocalSourceSchema = z.object({
  name: SourceNameSchema,
  type: z.literal("local"),
  path: z.string(),
});

const PackageSourceSchema = z.object({
  name: SourceNameSchema,
  type: z.literal("package"),
  registry: z.string(),
  install: z.string(),
});

const GitSourceSchema = z.object({
  name: SourceNameSchema,
  type: z.literal("git"),
  url: z.string(),
  ref: z.string(),
  subdir: z.string().optional(),
});

const UrlSourceSchema = z.object({
  name: SourceNameSchema,
  type: z.literal("url"),
  url: z.string(),
});

// org source fields aren't specified by PRD §5 yet; assumed shape until an org loader ticket defines one.
const OrgSourceSchema = z.object({
  name: SourceNameSchema,
  type: z.literal("org"),
  org: z.string(),
});

export const SourceSchema = z.discriminatedUnion("type", [
  LocalSourceSchema,
  PackageSourceSchema,
  GitSourceSchema,
  UrlSourceSchema,
  OrgSourceSchema,
]);
export type SourceConfig = z.infer<typeof SourceSchema>;

export const OverrideEntrySchema = z.object({
  targets: z.array(z.string()).optional(),
  scope: ScopeSchema.optional(),
  patch: z.string().optional(),
});
export type OverrideEntry = z.infer<typeof OverrideEntrySchema>;

export const ManifestSchema = z.object({
  sources: z.array(SourceSchema),
  resolution: z.object({
    precedence: z.array(z.string()),
  }),
  overrides: z.record(z.string(), OverrideEntrySchema).optional(),
});
export type Manifest = z.infer<typeof ManifestSchema>;
