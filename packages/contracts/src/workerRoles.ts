import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString, TrimmedString } from "./baseSchemas.ts";
import { ModelSelection } from "./modelSelection.ts";

export const WorkerRoleId = TrimmedNonEmptyString.check(
  Schema.isMaxLength(40),
  Schema.isPattern(/^[a-z0-9][a-z0-9_-]*$/),
);
export type WorkerRoleId = typeof WorkerRoleId.Type;

export const WorkerRoleIsolation = Schema.Literals(["shared", "worktree"]);
export type WorkerRoleIsolation = typeof WorkerRoleIsolation.Type;

/** A named worker preset `delegate_task` applies when called with this role id. */
export const WorkerRole = Schema.Struct({
  id: WorkerRoleId,
  label: TrimmedNonEmptyString.check(Schema.isMaxLength(60)),
  description: TrimmedString.check(Schema.isMaxLength(500)).pipe(
    Schema.withDecodingDefault(Effect.succeed("")),
  ),
  /** Prepended to every task this role receives. */
  instructions: TrimmedString.check(Schema.isMaxLength(8_000)).pipe(
    Schema.withDecodingDefault(Effect.succeed("")),
  ),
  /** Null runs on the orchestrator's own provider and model. */
  modelSelection: Schema.NullOr(ModelSelection).pipe(
    Schema.withDecodingDefault(Effect.succeed(null)),
  ),
  isolation: WorkerRoleIsolation.pipe(
    Schema.withDecodingDefault(Effect.succeed("shared" as const)),
  ),
});
export type WorkerRole = typeof WorkerRole.Type;

export const WorkerRoles = Schema.Array(WorkerRole).check(Schema.isMaxLength(32));
export type WorkerRoles = typeof WorkerRoles.Type;

export const DEFAULT_WORKER_ROLES: WorkerRoles = Schema.decodeSync(WorkerRoles)([
  {
    id: "scout",
    label: "Scout",
    description: "Explores the codebase and reports findings. Does not edit files.",
    instructions:
      "You are a scout. Investigate the codebase to answer the task. Do not edit, create, or delete files. Finish with a concise report: relevant files with paths and line numbers, how the code works, risks, and a suggested approach.",
  },
  {
    id: "implement",
    label: "Implementer",
    description: "Makes the code change in its own worktree and commits it.",
    instructions:
      "You are an implementer. Make the change the task describes, keep it minimal, run the relevant tests, and commit with a conventional commit message. Finish with a summary of what changed and how you verified it.",
    isolation: "worktree",
  },
  {
    id: "review",
    label: "Reviewer",
    description: "Reviews a change for bugs and regressions. Does not edit files.",
    instructions:
      "You are a reviewer. Review the change the task points to for correctness bugs, regressions, and missing tests. Do not edit files. Finish with a verdict (approve or changes needed) and a numbered list of concrete issues with file and line.",
  },
]);

export const findWorkerRole = (
  roles: WorkerRoles,
  id: string | undefined,
): WorkerRole | undefined => (id === undefined ? undefined : roles.find((role) => role.id === id));
