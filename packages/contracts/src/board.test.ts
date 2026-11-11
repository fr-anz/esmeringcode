import { describe, expect, it } from "vite-plus/test";

import { ProjectId } from "./baseSchemas.ts";
import { boardCardPrefix, nextBoardCardNumber, type BoardCardRecord } from "./board.ts";

const record = (projectId: string, number: number): BoardCardRecord => ({
  id: `${projectId}-${number}`,
  projectId: ProjectId.make(projectId),
  number,
  title: "Card",
  details: "",
  modelSelection: null,
  threadId: null,
  createdAt: "2026-11-11T00:00:00.000Z",
});

describe("nextBoardCardNumber", () => {
  it("counts per project and never reuses a deleted card's number", () => {
    const records = [record("a", 1), record("a", 4), record("b", 9)];
    expect(nextBoardCardNumber(records, ProjectId.make("a"))).toBe(5);
    expect(nextBoardCardNumber(records, ProjectId.make("c"))).toBe(1);
  });
});

describe("boardCardPrefix", () => {
  it.each([
    ["capybara", "CAP"],
    ["my-app", "MYA"],
    ["!!", "T3"],
  ])("keys %s as %s", (title, prefix) => {
    expect(boardCardPrefix(title)).toBe(prefix);
  });
});
