import { describe, expect, it } from "vite-plus/test";

import type { ThreadStatusPill } from "../Sidebar.logic";
import { boardLane, cardStatus, type CardState } from "./cardStatus";

const pill = (label: ThreadStatusPill["label"]): ThreadStatusPill => ({
  label,
  colorClass: "",
  dotClass: "",
  pulse: false,
});
const started: CardState = {
  started: true,
  pill: null,
  hasRun: true,
  activeWorkers: 0,
  pullRequestState: null,
};

describe("boardLane", () => {
  it.each([
    ["an unstarted card", { ...started, started: false }, "backlog"],
    ["a started card whose first turn has not begun", { ...started, hasRun: false }, "in_progress"],
    ["a running coordinator", { ...started, pill: pill("Working") }, "in_progress"],
    [
      "an idle coordinator with workers still running",
      { ...started, activeWorkers: 1 },
      "in_progress",
    ],
    ["a card waiting on the user", { ...started, pill: pill("Pending Approval") }, "needs_review"],
    ["a finished card", { ...started, pill: pill("Completed") }, "needs_review"],
    ["a failed card", { ...started, pill: pill("Failed") }, "needs_review"],
  ] as const)("puts %s in %s", (_name, state, lane) => {
    expect(boardLane(state)).toBe(lane);
  });
});

describe("cardStatus", () => {
  it("shows no phrase on a backlog card", () => {
    expect(cardStatus({ ...started, started: false })).toBeNull();
  });

  it("puts what needs the user ahead of pull request state", () => {
    expect(
      cardStatus({ ...started, pill: pill("Pending Approval"), pullRequestState: "open" })?.text,
    ).toBe("Needs your approval");
  });

  it("counts the workers a waiting coordinator is blocked on", () => {
    expect(cardStatus({ ...started, pill: pill("Waiting"), activeWorkers: 2 })?.text).toBe(
      "Waiting on 2 workers",
    );
  });

  it.each([
    ["merged", "Merged"],
    ["open", "PR is up"],
    [null, "Review needed"],
  ] as const)("reads a finished card with %s pull request as %s", (pullRequestState, text) => {
    expect(cardStatus({ ...started, pill: pill("Completed"), pullRequestState })?.text).toBe(text);
  });
});
