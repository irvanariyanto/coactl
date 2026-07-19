import { toolLabel, supportsCommands, supportsWorkflows, type Mode, type SkillTool } from "../nav";
import type { Workspace } from "../api";
import { PathCandidates } from "../components/PathCandidates";

interface Props {
  mode: Mode;
  tool: SkillTool;
  workspace: Workspace;
  onSelectSkills: () => void;
  onSelectRules: () => void;
  onSelectCommands: () => void;
  onSelectWorkflows: () => void;
}

/** Hub for resource kinds — Skills + Rules for every skill-capable tool. */
export function ResourcesView({
  mode,
  tool,
  workspace,
  onSelectSkills,
  onSelectRules,
  onSelectCommands,
  onSelectWorkflows,
}: Props) {
  const skillPaths = workspace.skillPathsByTool[tool];
  const rulePaths = workspace.rulePathsByTool[tool];
  const commandPaths = supportsCommands(tool) ? workspace.commandPathsByTool[tool] : undefined;
  const workflowPaths = supportsWorkflows(tool) ? workspace.workflowPathsByTool[tool] : undefined;
  const layout = workspace.ruleLayoutsByTool[tool];
  const activeSkills = mode === "global" ? skillPaths?.global : skillPaths?.project;
  const activeRules = mode === "global" ? rulePaths?.global : rulePaths?.project;
  const activeCommands = mode === "global" ? commandPaths?.global : commandPaths?.project;
  const activeWorkflows = mode === "global" ? workflowPaths?.global : workflowPaths?.project;
  const skillCount =
    mode === "global"
      ? workspace.toolSkillCounts[tool]?.global ?? 0
      : workspace.toolSkillCounts[tool]?.project ?? 0;
  const ruleCount =
    mode === "global"
      ? workspace.toolRuleCounts[tool]?.global ?? 0
      : workspace.toolRuleCounts[tool]?.project ?? 0;
  const commandCount = supportsCommands(tool)
    ? mode === "global"
      ? workspace.toolCommandCounts[tool]?.global ?? 0
      : workspace.toolCommandCounts[tool]?.project ?? 0
    : 0;
  const workflowCount = supportsWorkflows(tool)
    ? mode === "global"
      ? workspace.toolWorkflowCounts[tool]?.global ?? 0
      : workspace.toolWorkflowCounts[tool]?.project ?? 0
    : 0;

  const ruleBlurb =
    layout?.shape === "singleton"
      ? `${ruleCount ? "1" : "0"} instruction file (${tool === "gemini" ? "GEMINI.md" : "AGENTS.md"})`
      : `${ruleCount} rule file${ruleCount === 1 ? "" : "s"} (.${layout?.extension ?? "md"})`;

  const commandKind = activeCommands?.kind ?? "command";
  const commandBlurb = supportsCommands(tool)
    ? commandKind === "workflow"
      ? `${commandCount} workflow file${commandCount === 1 ? "" : "s"} (.md)`
      : `${commandCount} command file${commandCount === 1 ? "" : "s"} (.md)`
    : `Not supported for ${toolLabel(tool)}`;

  const workflowBlurb = supportsWorkflows(tool)
    ? `${workflowCount} workflow script${workflowCount === 1 ? "" : "s"} (.js)`
    : `Not supported for ${toolLabel(tool)}`;

  const kinds = [
    {
      id: "skills" as const,
      label: "Skills",
      enabled: true,
      blurb: `${skillCount} SKILL.md folder${skillCount === 1 ? "" : "s"} for this tool`,
    },
    {
      id: "rules" as const,
      label: "Rules",
      enabled: true,
      blurb: ruleBlurb,
    },
    {
      id: "commands" as const,
      label: "Commands",
      enabled: supportsCommands(tool),
      blurb: commandBlurb,
    },
    {
      id: "workflows" as const,
      label: "Workflows",
      enabled: supportsWorkflows(tool),
      blurb: workflowBlurb,
    },
  ];

  return (
    <section className="panel">
      <h2>
        {toolLabel(tool)} resources
        <span className={`badge scope-${mode}`}>{mode}</span>
      </h2>
      <p className="panel-sub">
        Pick a resource kind. Skills and Rules write to each tool&apos;s native folders or instruction
        files — no separate registry.
      </p>
      {activeSkills && <PathCandidates info={activeSkills} label="Active skills path" />}
      {activeRules && (
        <div style={{ marginTop: "0.65rem" }}>
          <PathCandidates
            info={activeRules}
            label={layout?.shape === "singleton" ? "Active instruction file" : "Active rules path"}
          />
        </div>
      )}
      {activeCommands && (
        <div style={{ marginTop: "0.65rem" }}>
          <PathCandidates
            info={activeCommands}
            label={
              commandKind === "workflow" ? "Active workflows path" : "Active commands path"
            }
          />
        </div>
      )}
      {activeWorkflows && (
        <div style={{ marginTop: "0.65rem" }}>
          <PathCandidates info={activeWorkflows} label="Active workflows path" />
        </div>
      )}
      <div className="tool-grid" style={{ marginTop: "1rem" }}>
        {kinds.map((kind) => (
          <button
            key={kind.id}
            type="button"
            className="tool-card"
            disabled={!kind.enabled}
            onClick={() => {
              if (kind.id === "skills") onSelectSkills();
              if (kind.id === "rules") onSelectRules();
              if (kind.id === "commands") onSelectCommands();
              if (kind.id === "workflows") onSelectWorkflows();
            }}
          >
            <span className="tool-card-head">
              <strong>{kind.label}</strong>
            </span>
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              {kind.blurb}
            </span>
            {!kind.enabled && (
              <span className="badge-row">
                <span className="badge">not supported</span>
              </span>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}
