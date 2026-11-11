import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  boardCoordinatorBrief,
  type BoardCardRecord,
  type BoardCardRecords,
  type ModelSelection,
} from "@t3tools/contracts";

import { newMessageId, newThreadId } from "~/lib/utils";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import { serverEnvironment } from "../../state/server";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";
import { toastManager } from "../ui/toast";

const nowIso = () => new Date().toISOString();
const failureMessage = (failure: unknown) =>
  failure instanceof Error ? failure.message : String(failure);

/** Card records and the user's own actions on them: start a backlog card, or delete it. */
export function useBoardCards(project: EnvironmentProject) {
  const environmentId = project.environmentId;
  const settings = useEnvironmentSettings(environmentId);
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings, { reportFailure: false });
  const createThread = useOrchestrationCommand(threadEnvironment.create, { reportFailure: false });
  const startTurn = useOrchestrationCommand(threadEnvironment.startTurn, { reportFailure: false });
  const records = settings.boardCards;

  const fail = (title: string, failure: unknown) => {
    toastManager.add({ type: "error", title, description: failureMessage(failure) });
    return false;
  };
  const saveRecords = async (next: BoardCardRecords) => {
    const result = await updateSettings({ environmentId, input: { patch: { boardCards: next } } });
    return result._tag === "Failure"
      ? fail("Board not saved", squashAtomCommandFailure(result))
      : true;
  };

  const deleteCard = (record: BoardCardRecord) =>
    saveRecords(records.filter((candidate) => candidate.id !== record.id));

  /** Creates the card's coordinator thread and sends its brief; the lane follows on its own. */
  const startCard = async (record: BoardCardRecord, fallbackModel: ModelSelection | null) => {
    const modelSelection = record.modelSelection ?? settings.defaultModelSelection ?? fallbackModel;
    if (modelSelection === null) return fail("Card not started", "Set up a provider first.");
    const threadId = newThreadId();
    // Link first, so the started thread never shows up as a card the board cannot match.
    const linked = await saveRecords(
      records.map((candidate) =>
        candidate.id === record.id ? { ...candidate, threadId, modelSelection } : candidate,
      ),
    );
    if (!linked) return false;
    const created = await createThread({
      environmentId,
      input: {
        threadId,
        projectId: project.id,
        title: record.title,
        modelSelection,
        runtimeMode: settings.defaultRuntimeMode,
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        createdAt: nowIso(),
      },
    });
    if (created._tag === "Failure") {
      await saveRecords(records);
      return fail("Card not started", squashAtomCommandFailure(created));
    }
    const started = await startTurn({
      environmentId,
      input: {
        threadId,
        message: {
          messageId: newMessageId(),
          role: "user",
          text: boardCoordinatorBrief(record.title, record.details),
          attachments: [],
        },
        modelSelection,
        titleSeed: record.title,
        runtimeMode: settings.defaultRuntimeMode,
        interactionMode: "default",
        createdAt: nowIso(),
      },
    });
    return started._tag === "Failure"
      ? fail("Card not started", squashAtomCommandFailure(started))
      : true;
  };

  return { records, deleteCard, startCard };
}
