import { useAtomValue } from "@effect/atom-react";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  BOARD_ORCHESTRATOR_TAG,
  boardOrchestratorBrief,
  type ModelSelection,
} from "@t3tools/contracts";

import { newMessageId, newThreadId } from "~/lib/utils";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import { serverEnvironment } from "../../state/server";
import { threadEnvironment } from "../../state/threads";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";
import { toastManager } from "../ui/toast";

/** A conversation idle this long starts the next message on a fresh session. */
const FRESH_SESSION_AFTER_MS = 30 * 60 * 1000;
const nowIso = () => new Date().toISOString();
const nowMs = () => Date.now();
const failureMessage = (failure: unknown) =>
  failure instanceof Error ? failure.message : String(failure);

/**
 * The project's orchestrator thread, and sending it a message. Each new conversation starts a
 * fresh provider session with the board snapshot, so the thread's history never fills the
 * model's context; follow-ups inside a conversation keep the session.
 */
export function useBoardOrchestrator(
  project: EnvironmentProject,
  projectShells: ReadonlyArray<EnvironmentThreadShell>,
) {
  const environmentId = project.environmentId;
  const settings = useEnvironmentSettings(environmentId);
  const serverConfig = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  const createThread = useOrchestrationCommand(threadEnvironment.create, { reportFailure: false });
  const setTag = useOrchestrationCommand(threadEnvironment.setTag, { reportFailure: false });
  const startTurn = useOrchestrationCommand(threadEnvironment.startTurn, { reportFailure: false });
  const thread =
    projectShells
      .filter(
        (shell) => shell.archivedAt === null && shell.source.tags?.includes(BOARD_ORCHESTRATOR_TAG),
      )
      .toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null;
  const supportsFreshSession = serverConfig?.environment.capabilities.freshContext === true;

  const fail = (failure: unknown) => {
    toastManager.add({
      type: "error",
      title: "Message not sent",
      description: failureMessage(failure),
    });
    return false;
  };

  const send = async (input: {
    message: string;
    boardSnapshot: string;
    modelSelection: ModelSelection | null;
  }) => {
    const briefed = boardOrchestratorBrief({
      projectTitle: project.title,
      boardSnapshot: input.boardSnapshot,
      message: input.message,
    });
    if (thread === null) {
      const modelSelection = input.modelSelection ?? settings.defaultModelSelection;
      if (modelSelection === null) return fail("Set up a provider first.");
      const threadId = newThreadId();
      const created = await createThread({
        environmentId,
        input: {
          threadId,
          projectId: project.id,
          title: "Orchestrator",
          modelSelection,
          runtimeMode: settings.defaultRuntimeMode,
          interactionMode: "default",
          branch: null,
          worktreePath: null,
          createdAt: nowIso(),
        },
      });
      if (created._tag === "Failure") return fail(squashAtomCommandFailure(created));
      const tagged = await setTag({
        environmentId,
        input: { threadId, tag: BOARD_ORCHESTRATOR_TAG, tagged: true },
      });
      if (tagged._tag === "Failure") return fail(squashAtomCommandFailure(tagged));
      return startOn(threadId, briefed, modelSelection, false);
    }
    const lastMessageAt = thread.latestUserMessageAt
      ? Date.parse(thread.latestUserMessageAt)
      : Number.NaN;
    const fresh = Number.isNaN(lastMessageAt) || nowMs() - lastMessageAt > FRESH_SESSION_AFTER_MS;
    return startOn(
      thread.id,
      fresh ? briefed : input.message,
      input.modelSelection,
      fresh && supportsFreshSession,
    );
  };

  const startOn = async (
    threadId: EnvironmentThreadShell["id"],
    text: string,
    modelSelection: ModelSelection | null,
    freshContext: boolean,
  ) => {
    const started = await startTurn({
      environmentId,
      input: {
        threadId,
        message: { messageId: newMessageId(), role: "user", text, attachments: [] },
        ...(modelSelection === null ? {} : { modelSelection }),
        runtimeMode: settings.defaultRuntimeMode,
        interactionMode: "default",
        ...(freshContext ? { freshContext: true } : {}),
        createdAt: nowIso(),
      },
    });
    return started._tag === "Failure" ? fail(squashAtomCommandFailure(started)) : true;
  };

  return { thread, send };
}
