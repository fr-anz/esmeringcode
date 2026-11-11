import {
  OrchestratorMcpFailure,
  OrchestrationV2ShellThreadStatus,
  PositiveInt,
  ThreadId,
} from "@t3tools/contracts";
import { Tool, Toolkit } from "effect/ai";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Schema from "effect/Schema";

import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import * as ServerSettings from "../../../serverSettings.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as OrchestratorMcpService from "../../OrchestratorMcpService.ts";

const dependencies = [
  McpInvocationContext.McpInvocationContext,
  ThreadManagementService.ThreadManagementService,
  ServerSettings.ServerSettingsService,
  OrchestratorMcpService.OrchestratorMcpService,
  SecureRandom.SecureRandom,
];

const BoardCard = Schema.Struct({
  number: PositiveInt,
  title: Schema.String,
  details: Schema.String,
  threadId: Schema.NullOr(ThreadId),
  status: Schema.Union([
    Schema.Literals(["backlog", "starting", "archived"]),
    OrchestrationV2ShellThreadStatus,
  ]),
});

const BoardCardsTool = Tool.make("t3_board_cards", {
  description:
    "List this project's board cards: number, title, spec, and status (`backlog` until started, then its thread's status).",
  parameters: Tool.EmptyParams,
  success: Schema.Struct({ cards: Schema.Array(BoardCard) }),
  failure: OrchestratorMcpFailure,
  failureMode: "return" as const,
  dependencies,
})
  .annotate(Tool.Title, "List board cards")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

const BoardAddCardTool = Tool.make("t3_board_add_card", {
  description:
    "Add a card to this project's board backlog. `details` is the spec its coordinator gets; make it self-contained. `start: true` also starts it.",
  parameters: Schema.Struct({
    title: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200)),
    details: Schema.optional(Schema.String.check(Schema.isMaxLength(20_000))),
    start: Schema.optional(Schema.Boolean),
  }),
  success: Schema.Struct({ number: PositiveInt, threadId: Schema.NullOr(ThreadId) }),
  failure: OrchestratorMcpFailure,
  failureMode: "return" as const,
  dependencies,
})
  .annotate(Tool.Title, "Add a board card")
  .annotate(Tool.Destructive, false);

const BoardStartCardTool = Tool.make("t3_board_start_card", {
  description:
    "Start a backlog card by `number`: creates its coordinator thread, which delegates to worker roles.",
  parameters: Schema.Struct({ number: PositiveInt }),
  success: Schema.Struct({ number: PositiveInt, threadId: ThreadId }),
  failure: OrchestratorMcpFailure,
  failureMode: "return" as const,
  dependencies,
})
  .annotate(Tool.Title, "Start a board card")
  .annotate(Tool.Destructive, true)
  .annotate(Tool.OpenWorld, true);

export const BoardToolkit = Toolkit.make(BoardCardsTool, BoardAddCardTool, BoardStartCardTool);
