import { describe, expect, it } from "@effect/vitest";

import {
  EnvironmentId,
  ProviderInstanceId,
  type OrchestratorMcpDelegateTaskInput,
  type WorkerRole,
} from "@t3tools/contracts";

import { applyWorkerRole } from "./workerRoles.ts";

const implement: WorkerRole = {
  id: "implement",
  label: "Implementer",
  description: "",
  instructions: "Commit when done.",
  modelSelection: {
    instanceId: ProviderInstanceId.make("codex"),
    model: "gpt-5",
    options: [{ id: "reasoningEffort", value: "high" }],
  },
  isolation: "worktree",
};

const input = (
  extra: Partial<OrchestratorMcpDelegateTaskInput> = {},
): OrchestratorMcpDelegateTaskInput => ({ task: "Fix the bug.", role: "implement", ...extra });

describe("applyWorkerRole", () => {
  it("leaves the input alone without a matching role", () => {
    expect(applyWorkerRole(input(), undefined)).toEqual(input());
  });

  it("fills model, options, isolation, and instructions from the role", () => {
    expect(applyWorkerRole(input(), implement)).toEqual({
      task: "Commit when done.\n\n## Task\n\nFix the bug.",
      role: "implement",
      isolation: "worktree",
      target: {
        providerInstanceId: ProviderInstanceId.make("codex"),
        model: "gpt-5",
        options: [{ id: "reasoningEffort", value: "high" }],
      },
    });
  });

  it("keeps an explicit model choice and isolation from the caller", () => {
    const result = applyWorkerRole(
      input({ target: { model: "gpt-5-mini" }, isolation: "shared" }),
      implement,
    );
    expect(result.target).toEqual({ model: "gpt-5-mini" });
    expect(result.isolation).toBe("shared");
  });

  it("keeps a linked environment's own provider and model", () => {
    const target = { environmentId: EnvironmentId.make("env_remote") };
    const result = applyWorkerRole(input({ target }), implement);
    expect(result.target).toEqual(target);
    expect(result.isolation).toBe("worktree");
  });

  it("inherits the caller's model when the role has none", () => {
    const result = applyWorkerRole(input(), {
      ...implement,
      modelSelection: null,
      instructions: "",
    });
    expect(result.target).toBeUndefined();
    expect(result.task).toBe("Fix the bug.");
  });
});
