import { describe, expect, it } from "vitest";
import { compileWorkflowSteps } from "../../src/transform/workflow.js";
import type { Step } from "../../src/schema/index.js";

describe("compileWorkflowSteps", () => {
  it("compiles sequential run steps", () => {
    const steps: Step[] = [{ run: "skill:plan" }, { run: "command:test" }];
    const output = compileWorkflowSteps(steps);
    expect(output).toContain("@plan");
    expect(output).toContain("@test");
  });

  it("compiles loop steps with until condition", () => {
    const steps: Step[] = [{ loop: { until: "done", do: [{ run: "command:test" }] } }];
    const output = compileWorkflowSteps(steps);
    expect(output).toContain("Loop");
    expect(output).toContain("done");
    expect(output).toContain("@test");
  });

  it("handles mixed run and loop steps", () => {
    const steps: Step[] = [
      { run: "skill:plan" },
      { loop: { until: "green", do: [{ run: "command:fix" }] } },
    ];
    const output = compileWorkflowSteps(steps);
    expect(output).toContain("@plan");
    expect(output).toContain("@fix");
    expect(output).toContain("green");
  });
});
