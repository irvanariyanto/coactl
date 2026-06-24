import { z } from "zod";

export const ASSET_KINDS = ["skill", "command", "rule", "workflow"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const SUPPORTED_TARGETS = ["claude-code", "codex", "cursor", "windsurf", "copilot"] as const;
export type Target = (typeof SUPPORTED_TARGETS)[number];

const KEBAB_CASE_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SEMVER_REGEX = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export const ScopeSchema = z.object({
  languages: z.array(z.string()).optional(),
  paths: z.array(z.string()).optional(),
});
export type Scope = z.infer<typeof ScopeSchema>;

export const TriggerSchema = z.object({
  type: z.enum(["glob", "manual"]),
  pattern: z.string().optional(),
});
export type Trigger = z.infer<typeof TriggerSchema>;

const RunStepSchema = z.object({ run: z.string() }).strict();
const LoopStepSchema = z
  .object({
    loop: z.object({
      until: z.string(),
      do: z.array(z.object({ run: z.string() }).strict()),
    }),
  })
  .strict();
export const StepSchema = z.union([RunStepSchema, LoopStepSchema]);
export type Step = z.infer<typeof StepSchema>;

export const AssetSchema = z
  .object({
    id: z.string().regex(KEBAB_CASE_REGEX, "id must be kebab-case (e.g. my-asset)"),
    kind: z.enum(ASSET_KINDS),
    name: z.string(),
    version: z.string().regex(SEMVER_REGEX, "version must be a valid semver string"),
    description: z.string(),
    activation: z.enum(["auto", "manual", "agent-requested"]),
    invocation: z.string().optional(),
    scope: ScopeSchema.optional(),
    triggers: z.array(TriggerSchema).optional(),
    steps: z.array(StepSchema).optional(),
    targets: z.array(z.enum(SUPPORTED_TARGETS)),
    priority: z.number().int().optional(),
    body: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.invocation !== undefined && data.kind !== "command" && data.kind !== "workflow") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["invocation"],
        message: 'invocation is only allowed when kind is "command"',
      });
    }
    if (data.steps !== undefined && data.kind !== "workflow") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["steps"],
        message: 'steps is only allowed when kind is "workflow"',
      });
    }
    if (data.triggers !== undefined && data.kind !== "skill" && data.kind !== "rule") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["triggers"],
        message: 'triggers is only allowed when kind is "skill" or "rule"',
      });
    }
  });

export type Asset = z.infer<typeof AssetSchema>;
