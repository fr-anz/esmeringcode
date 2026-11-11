import * as Schema from "effect/Schema";
import {
  IsoDateTime,
  PositiveInt,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
  TrimmedString,
} from "./baseSchemas.ts";
import { ModelSelection } from "./modelSelection.ts";

/** Marks the project's orchestrator thread, which the board's composer talks to. */
export const BOARD_ORCHESTRATOR_TAG = "board-orchestrator";

/**
 * A board card: a stable number for its id, its spec, and the model it starts on. A backlog
 * card has no thread; starting it creates the coordinator thread that `threadId` names.
 */
export const BoardCardRecord = Schema.Struct({
  id: TrimmedNonEmptyString.check(Schema.isMaxLength(64)),
  projectId: ProjectId,
  number: PositiveInt,
  title: TrimmedNonEmptyString.check(Schema.isMaxLength(200)),
  details: TrimmedString.check(Schema.isMaxLength(20_000)),
  modelSelection: Schema.NullOr(ModelSelection),
  threadId: Schema.NullOr(ThreadId),
  createdAt: IsoDateTime,
});
export type BoardCardRecord = typeof BoardCardRecord.Type;

export const BoardCardRecords = Schema.Array(BoardCardRecord).check(Schema.isMaxLength(2_000));
export type BoardCardRecords = typeof BoardCardRecords.Type;

/** Short project key for card ids, such as `CAP` in `CAP-12`. */
export const boardCardPrefix = (projectTitle: string) =>
  (projectTitle.replace(/[^a-z0-9]/gi, "").slice(0, 3) || "T3").toUpperCase();

/** Numbers never repeat within a project, even after cards are deleted. */
export const nextBoardCardNumber = (records: BoardCardRecords, projectId: ProjectId) =>
  Math.max(0, ...records.filter((r) => r.projectId === projectId).map((r) => r.number)) + 1;

/** The first message of a started card's thread, which makes that thread the card's coordinator. */
export const boardCoordinatorBrief = (title: string, details: string) =>
  [
    "You coordinate this board card. Do not do the work yourself: hand each step to a worker with `delegate_task`, passing a `role` id from `orchestrator_capabilities` so each step runs on that role's model.",
    "",
    "A typical flow:",
    "1. Delegate to a scout role to map the relevant code.",
    "2. Delegate to an implementer role with the scout's findings.",
    "3. Delegate to a reviewer role. If it asks for changes, go back to the implementer.",
    "4. Open a pull request if one is wanted.",
    "",
    "Give each worker a self-contained task: it does not see this conversation. When you finish, summarize what changed and what the user should check. The board moves this card to review on its own.",
    "",
    `## Card: ${title}`,
    ...(details === "" ? [] : ["", details]),
  ].join("\n");

/** Opens each orchestrator conversation, which starts on a fresh session with this board snapshot. */
export const boardOrchestratorBrief = (input: {
  readonly projectTitle: string;
  readonly boardSnapshot: string;
  readonly message: string;
}) =>
  [
    `You are the orchestrator for the "${input.projectTitle}" board. The user talks to you here to plan and steer work; you do not write code yourself.`,
    "",
    "- Turn requests into well-scoped cards with `t3_board_add_card`: a short title and a self-contained spec (goal, relevant files if known, acceptance criteria). Split large requests into several cards.",
    "- Cards land in the backlog. Pass `start: true` only when the user asks to begin; otherwise let them review the specs and start cards themselves.",
    "- `t3_board_start_card` starts a backlog card. Its coordinator delegates to scout, implementer, and reviewer roles.",
    "- `t3_board_cards` lists the board. To report on a card, read its thread with `t3_thread_read`.",
    "- Lanes move on their own: Backlog until started, In progress while agents run, Needs review when finished or waiting on the user.",
    "",
    "## Board now",
    "",
    input.boardSnapshot === "" ? "No cards yet." : input.boardSnapshot,
    "",
    "## User",
    "",
    input.message,
  ].join("\n");
