import type { PullRequestState } from "@t3tools/contracts";

import type { ThreadStatusPill } from "../Sidebar.logic";

export const BOARD_COLUMNS = ["backlog", "in_progress", "needs_review"] as const;
export type BoardColumn = (typeof BOARD_COLUMNS)[number];

export const BOARD_COLUMN_LABELS: Record<BoardColumn, string> = {
  backlog: "Backlog",
  in_progress: "In progress",
  needs_review: "Needs review",
};

export interface CardState {
  /** False for a backlog card: its coordinator thread does not exist yet. */
  readonly started: boolean;
  /** Null until the started card's thread reaches this client. */
  readonly pill: ThreadStatusPill | null;
  readonly hasRun: boolean;
  readonly activeWorkers: number;
  readonly pullRequestState: PullRequestState | null;
}

const NEEDS_YOU: ReadonlySet<ThreadStatusPill["label"]> = new Set([
  "Pending Approval",
  "Awaiting Input",
  "Guest Request",
  "Plan Ready",
]);
const ACTIVE: ReadonlySet<ThreadStatusPill["label"]> = new Set([
  "Working",
  "Connecting",
  "Waiting",
]);

/** The lane follows the card's live state; nobody moves cards by hand. */
export function boardLane(state: CardState): BoardColumn {
  if (!state.started) return "backlog";
  if (state.pill !== null && NEEDS_YOU.has(state.pill.label)) return "needs_review";
  if (state.pill !== null && ACTIVE.has(state.pill.label)) return "in_progress";
  if (state.activeWorkers > 0) return "in_progress";
  // Started but its first turn has not begun: it is on its way, not finished.
  if (!state.hasRun) return "in_progress";
  return "needs_review";
}

export interface CardStatus {
  readonly text: string;
  readonly tone: "attention" | "active" | "error" | "ready" | "merged" | "muted";
}

/** The card footer's phrase: what the card needs from you, or what its agents are doing. */
export function cardStatus(state: CardState): CardStatus | null {
  if (!state.started) return null;
  switch (state.pill?.label) {
    case "Pending Approval":
      return { text: "Needs your approval", tone: "attention" };
    case "Awaiting Input":
      return { text: "Has a question for you", tone: "attention" };
    case "Guest Request":
      return { text: "Guest is asking", tone: "attention" };
    case "Plan Ready":
      return { text: "Plan ready to check", tone: "attention" };
    case "Failed":
      return { text: "Error", tone: "error" };
    case "Connecting":
      return { text: "Starting", tone: "active" };
    case "Working":
      return { text: "Running", tone: "active" };
    case "Waiting":
      return {
        text:
          state.activeWorkers > 0
            ? `Waiting on ${state.activeWorkers} worker${state.activeWorkers === 1 ? "" : "s"}`
            : "Waiting on workers",
        tone: "active",
      };
  }
  if (state.activeWorkers > 0) return { text: "Workers running", tone: "active" };
  if (!state.hasRun) return { text: "Starting", tone: "active" };
  if (state.pullRequestState === "merged") return { text: "Merged", tone: "merged" };
  if (state.pullRequestState === "open") return { text: "PR is up", tone: "ready" };
  if (state.pullRequestState === "closed") return { text: "PR closed", tone: "muted" };
  return { text: "Review needed", tone: "ready" };
}
