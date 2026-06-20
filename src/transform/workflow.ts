// Assumption: Claude Code workflow steps compile to a command file that lists each step
// using @<id> subagent syntax. No official structured workflow schema exists as of
// authoring — update if Claude Code ships one. (CLAUDE.md guardrail)
import type { Step } from "../schema/index.js";

export function compileWorkflowSteps(steps: Step[]): string {
  const lines: string[] = ["## Workflow Steps", ""];
  for (const step of steps) {
    if ("run" in step) {
      const [kind, id] = step.run.split(":");
      lines.push(`- @${id ?? step.run} *(${kind ?? "asset"})*`);
    } else if ("loop" in step) {
      lines.push(`- **Loop** until \`${step.loop.until}\`:`);
      for (const doStep of step.loop.do) {
        const [kind, id] = doStep.run.split(":");
        lines.push(`  - @${id ?? doStep.run} *(${kind ?? "asset"})*`);
      }
    }
  }
  return lines.join("\n") + "\n";
}
