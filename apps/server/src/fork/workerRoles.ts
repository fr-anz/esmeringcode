import type {
  OrchestratorMcpDelegateTaskInput,
  OrchestratorMcpRoleCapability,
  WorkerRole,
  WorkerRoles,
} from "@t3tools/contracts";

/**
 * Fills a delegation from its worker role. Whatever the caller set explicitly wins, and a
 * task bound for a linked environment keeps that environment's own provider and model.
 */
export const applyWorkerRole = (
  input: OrchestratorMcpDelegateTaskInput,
  role: WorkerRole | undefined,
): OrchestratorMcpDelegateTaskInput => {
  if (role === undefined) return input;
  const target = input.target;
  const keepsTarget =
    role.modelSelection === null ||
    target?.environmentId !== undefined ||
    target?.providerInstanceId !== undefined ||
    target?.driverKind !== undefined ||
    target?.model !== undefined;
  const selection = role.modelSelection;
  return {
    ...input,
    ...(keepsTarget || selection === null
      ? {}
      : {
          target: {
            ...target,
            providerInstanceId: selection.instanceId,
            model: selection.model,
            ...(target?.options === undefined && selection.options !== undefined
              ? { options: selection.options }
              : {}),
          },
        }),
    isolation: input.isolation ?? role.isolation,
    task:
      role.instructions === "" ? input.task : `${role.instructions}\n\n## Task\n\n${input.task}`,
  };
};

export const workerRoleCapabilities = (
  roles: WorkerRoles,
): ReadonlyArray<OrchestratorMcpRoleCapability> =>
  roles.map((role) => ({
    id: role.id,
    label: role.label,
    description: role.description,
    providerInstanceId: role.modelSelection?.instanceId ?? null,
    model: role.modelSelection?.model ?? null,
    isolation: role.isolation,
  }));
