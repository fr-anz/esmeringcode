import {
  boardCoordinatorBrief,
  nextBoardCardNumber,
  OrchestratorMcpFailure,
  type BoardCardRecord,
  type BoardCardRecords,
} from "@t3tools/contracts";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import * as ServerSettings from "../../../serverSettings.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import * as OrchestratorMcpService from "../../OrchestratorMcpService.ts";
import { readThread, unavailable } from "../../threadAccess.ts";
import { BoardToolkit } from "./tools.ts";

const settingsFailure = () =>
  new OrchestratorMcpFailure({
    code: "orchestration_error",
    message: "Unable to read or save the board.",
  });

const readRecords = Effect.gen(function* () {
  const settings = yield* ServerSettings.ServerSettingsService;
  return (yield* settings.getSettings.pipe(Effect.mapError(settingsFailure))).boardCards;
});

const saveRecords = Effect.fn("BoardMcp.saveRecords")(function* (records: BoardCardRecords) {
  const settings = yield* ServerSettings.ServerSettingsService;
  yield* settings.updateSettings({ boardCards: records }).pipe(Effect.mapError(settingsFailure));
});

/** The caller's project: the board this orchestrator works on. */
const callerProjectId = readThread().pipe(
  Effect.map(({ projection }) => projection.thread.projectId),
);

/** Starts a backlog card's coordinator thread in the caller's checkout and links it. */
const startCard = Effect.fn("BoardMcp.startCard")(function* (record: BoardCardRecord) {
  if (record.threadId !== null) {
    return yield* new OrchestratorMcpFailure({
      code: "invalid_request",
      message: `Card ${record.number} already started.`,
    });
  }
  const scope = yield* McpInvocationContext.McpInvocationContext;
  const service = yield* OrchestratorMcpService.OrchestratorMcpService;
  const selection = record.modelSelection;
  const { threads } = yield* service.createThreads(scope, {
    threads: [
      {
        title: record.title,
        prompt: boardCoordinatorBrief(record.title, record.details),
        ...(selection === null
          ? {}
          : {
              target: {
                providerInstanceId: selection.instanceId,
                model: selection.model,
                ...(selection.options === undefined ? {} : { options: selection.options }),
              },
            }),
      },
    ],
  });
  const threadId = threads[0]?.threadId;
  if (threadId === undefined) return yield* unavailable();
  // Re-read: the user may have edited the board while the thread was being created.
  const latest = yield* readRecords;
  yield* saveRecords(
    latest.map((candidate) =>
      candidate.id === record.id ? { ...candidate, threadId } : candidate,
    ),
  );
  return { number: record.number, threadId };
});

export const layer = McpToolAccess.toLayer(BoardToolkit, {
  t3_board_cards: McpToolAccess.reads(() =>
    Effect.gen(function* () {
      const { threads, projection } = yield* readThread();
      const records = yield* readRecords;
      const cards = yield* Effect.forEach(
        records.filter((record) => record.projectId === projection.thread.projectId),
        (record) =>
          Effect.gen(function* () {
            const shell =
              record.threadId === null
                ? null
                : yield* threads.getThreadShell(record.threadId).pipe(Effect.mapError(unavailable));
            const status =
              record.threadId === null
                ? ("backlog" as const)
                : shell === null
                  ? ("starting" as const)
                  : shell.archivedAt !== null
                    ? ("archived" as const)
                    : shell.status;
            return {
              number: record.number,
              title: record.title,
              details: record.details,
              threadId: record.threadId,
              status,
            };
          }),
      );
      return { cards };
    }),
  ),
  t3_board_add_card: McpToolAccess.actsAsCaller((input) =>
    Effect.gen(function* () {
      const projectId = yield* callerProjectId;
      const random = yield* SecureRandom.SecureRandom;
      const records = yield* readRecords;
      const record: BoardCardRecord = {
        id: yield* random.uuidV4(),
        projectId,
        number: nextBoardCardNumber(records, projectId),
        title: input.title.trim(),
        details: input.details?.trim() ?? "",
        modelSelection: null,
        threadId: null,
        createdAt: DateTime.formatIso(yield* DateTime.now),
      };
      yield* saveRecords([...records, record]);
      if (input.start !== true) return { number: record.number, threadId: null };
      return yield* startCard(record);
    }),
  ),
  t3_board_start_card: McpToolAccess.actsAsCaller((input) =>
    Effect.gen(function* () {
      const projectId = yield* callerProjectId;
      const record = (yield* readRecords).find(
        (candidate) => candidate.projectId === projectId && candidate.number === input.number,
      );
      if (record === undefined) {
        return yield* new OrchestratorMcpFailure({
          code: "invalid_request",
          message: `No card ${input.number} on this board.`,
        });
      }
      return yield* startCard(record);
    }),
  ),
});
