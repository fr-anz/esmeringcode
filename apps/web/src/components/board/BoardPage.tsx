import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import {
  boardCardPrefix,
  type BoardCardRecord,
  type ModelSelection,
  type ServerProvider,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { Link, useNavigate } from "@tanstack/react-router";
import { CircleDashedIcon, CircleIcon, ContrastIcon, GitBranchIcon, PlusIcon } from "lucide-react";
import { useRef, useState, type ReactNode, type RefObject } from "react";

import { isElectron } from "~/env";
import { cn } from "~/lib/utils";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import { providerInstanceEntriesFor } from "../../providerInstances";
import { useProjects, useThreadShells } from "../../state/entities";
import { useEnvironmentProviders } from "../../state/environments";
import { EMPTY_SERVER_PROVIDERS } from "../../state/server";
import { threadEnvironment } from "../../state/threads";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";
import { buildThreadRouteParams } from "../../threadRoutes";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { DiffStatLabel } from "../chat/DiffStatLabel";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { PULL_REQUEST_STATE_PRESENTATION } from "../pullRequest/pullRequestIcons";
import { resolveThreadStatusPill } from "../Sidebar.logic";
import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { SidebarInset } from "../ui/sidebar";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { BoardComposer } from "./BoardComposer";
import {
  BOARD_COLUMN_LABELS,
  BOARD_COLUMNS,
  boardLane,
  cardStatus,
  type BoardColumn,
  type CardState,
  type CardStatus,
} from "./cardStatus";
import { useBoardCards } from "./useBoardCards";
import { useBoardOrchestrator } from "./useBoardOrchestrator";

const projectKey = (project: EnvironmentProject) => `${project.environmentId}:${project.id}`;

const COLUMN_ICON: Record<BoardColumn, ReactNode> = {
  backlog: <CircleIcon className="size-4 text-muted-foreground" />,
  in_progress: <ContrastIcon className="size-4 text-warning" />,
  needs_review: <CircleDashedIcon className="size-4 text-success" />,
};

const TONE_CLASS: Record<CardStatus["tone"], string> = {
  attention: "text-warning",
  active: "text-info",
  error: "text-destructive",
  ready: "text-primary",
  merged: PULL_REQUEST_STATE_PRESENTATION.merged.toneClassName,
  muted: "text-muted-foreground",
};

type BoardTab = "active" | "archived";

interface BoardItem {
  readonly record: BoardCardRecord;
  readonly thread: EnvironmentThreadShell | null;
  readonly workers: ReadonlyArray<EnvironmentThreadShell>;
  readonly state: CardState;
  readonly lane: BoardColumn;
}

export function BoardPage() {
  const projects = useProjects().filter((project) => !project.isScratch);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [tab, setTab] = useState<BoardTab>("active");
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const project =
    projects.find((candidate) => projectKey(candidate) === selectedKey) ?? projects[0] ?? null;

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        <WorkspacePageHeader electron={isElectron} className="border-b">
          <h1 className="text-sm font-medium">Board</h1>
          {project ? (
            <Select
              value={projectKey(project)}
              onValueChange={(value) => typeof value === "string" && setSelectedKey(value)}
            >
              <SelectTrigger
                aria-label="Project"
                size="compact"
                variant="ghost"
                className="w-auto min-w-0"
              >
                <SelectValue>{project.title}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="start" alignItemWithTrigger={false}>
                {projects.map((candidate) => (
                  <SelectItem key={projectKey(candidate)} value={projectKey(candidate)}>
                    {candidate.title}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          ) : null}
          <ToggleGroup
            aria-label="Cards"
            className="ms-2 shrink-0"
            variant="segmented"
            value={[tab]}
            onValueChange={(value) => {
              const next = value[0];
              if (next === "active" || next === "archived") setTab(next);
            }}
          >
            <Toggle value="active">Active</Toggle>
            <Toggle value="archived">Archived</Toggle>
          </ToggleGroup>
          <div className="flex-1" />
          <Button
            size="sm"
            disabled={project === null}
            onClick={() => composerRef.current?.focus()}
          >
            <PlusIcon />
            Task
          </Button>
        </WorkspacePageHeader>
        {project ? (
          <ProjectBoard
            key={projectKey(project)}
            project={project}
            archived={tab === "archived"}
            composerRef={composerRef}
          />
        ) : (
          <p className="p-5 text-sm text-muted-foreground">Add a project to use the board.</p>
        )}
      </div>
    </SidebarInset>
  );
}

function useFallbackModel(project: EnvironmentProject) {
  const settings = useEnvironmentSettings(project.environmentId);
  const providers = useEnvironmentProviders().get(project.environmentId) ?? EMPTY_SERVER_PROVIDERS;
  const entry = providerInstanceEntriesFor(providers, settings, project.id).find(
    (candidate) => candidate.enabled && candidate.isAvailable,
  );
  const model = entry?.models[0];
  const fallback: ModelSelection | null =
    entry && model ? createModelSelection(entry.instanceId, model.slug) : null;
  return { providers, fallback };
}

const isActiveWorker = (worker: EnvironmentThreadShell) =>
  worker.runtime !== null &&
  worker.runtime.status !== "idle" &&
  worker.runtime.activeRunId !== null;

/** A short text view of the board the orchestrator gets at the start of each conversation. */
const boardSnapshot = (items: ReadonlyArray<BoardItem>, prefix: string) =>
  items
    .slice(0, 60)
    .map((item) => {
      const status = cardStatus(item.state)?.text;
      const lane = BOARD_COLUMN_LABELS[item.lane];
      return `- ${cardLabel(prefix, item.record)} (card ${item.record.number}) [${status ? `${lane}: ${status}` : lane}] ${item.record.title}`;
    })
    .join("\n");

const cardLabel = (prefix: string, record: BoardCardRecord) =>
  `${prefix}-${String(record.number).padStart(3, "0")}`;

function ProjectBoard({
  project,
  archived,
  composerRef,
}: {
  project: EnvironmentProject;
  archived: boolean;
  composerRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const shells = useThreadShells().filter(
    (shell) =>
      shell.environmentId === project.environmentId &&
      shell.projectId === project.id &&
      shell.deletedAt === null,
  );
  const cards = useBoardCards(project);
  const orchestrator = useBoardOrchestrator(project, shells);
  const { providers, fallback } = useFallbackModel(project);
  const prefix = boardCardPrefix(project.title);

  const threadsById = new Map<string, EnvironmentThreadShell>(
    shells.map((shell) => [shell.id, shell]),
  );
  const workersByCard = new Map<string, Array<EnvironmentThreadShell>>();
  for (const shell of shells) {
    const parent = shell.lineage.parentThreadId;
    if (parent !== null) workersByCard.set(parent, [...(workersByCard.get(parent) ?? []), shell]);
  }
  const allItems: Array<BoardItem> = cards.records
    .filter((record) => record.projectId === project.id)
    .map((record) => {
      const thread = record.threadId === null ? null : (threadsById.get(record.threadId) ?? null);
      const workers = thread ? (workersByCard.get(thread.id) ?? []) : [];
      const pullRequest = thread?.pullRequests.at(-1);
      const state: CardState = {
        started: record.threadId !== null,
        pill: thread ? resolveThreadStatusPill({ thread }) : null,
        hasRun: thread?.latestRun != null,
        activeWorkers: workers.filter(isActiveWorker).length,
        pullRequestState:
          pullRequest === undefined ? null : (pullRequest.snapshot?.state ?? "open"),
      };
      return { record, thread, workers, state, lane: boardLane(state) };
    });
  const activeItems = allItems.filter((item) => item.thread?.archivedAt == null);
  const items = archived ? allItems.filter((item) => item.thread?.archivedAt != null) : activeItems;

  return (
    <>
      <div className="flex min-h-0 flex-1 items-start gap-4 overflow-x-auto p-4 pb-36">
        {BOARD_COLUMNS.map((column) => {
          const columnItems = items
            .filter((item) => item.lane === column)
            .toSorted((left, right) => sortTime(right).localeCompare(sortTime(left)));
          return (
            <section
              key={column}
              aria-label={BOARD_COLUMN_LABELS[column]}
              className="flex max-h-full w-80 shrink-0 flex-col rounded-2xl bg-muted/60 p-2"
            >
              <h2 className="flex items-center gap-2 px-2 py-1.5 text-sm font-medium">
                {COLUMN_ICON[column]}
                <span>{BOARD_COLUMN_LABELS[column]}</span>
                <span className="rounded-md bg-muted px-1.5 text-xs text-muted-foreground tabular-nums">
                  {columnItems.length}
                </span>
              </h2>
              <div className="flex min-h-0 flex-col gap-2 overflow-y-auto pt-1">
                {columnItems.length === 0 ? (
                  <p className="px-2 py-6 text-center text-xs text-muted-foreground/70">
                    {archived ? "Nothing archived" : "No cards"}
                  </p>
                ) : (
                  columnItems.map((item) => (
                    <BoardCard
                      key={item.record.id}
                      item={item}
                      label={cardLabel(prefix, item.record)}
                      provider={providerFor(item, providers)}
                      onStart={() => void cards.startCard(item.record, fallback)}
                      onDelete={() => void cards.deleteCard(item.record)}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
      {archived ? null : (
        <BoardComposer
          project={project}
          textareaRef={composerRef}
          orchestrator={orchestrator}
          boardSnapshot={boardSnapshot(activeItems, prefix)}
        />
      )}
    </>
  );
}

const sortTime = (item: BoardItem) => item.thread?.updatedAt ?? item.record.createdAt;

const providerFor = (item: BoardItem, providers: ReadonlyArray<ServerProvider>) => {
  const instanceId = item.thread?.providerInstanceId ?? item.record.modelSelection?.instanceId;
  return providers.find((provider) => provider.instanceId === instanceId);
};

const threadLink = (shell: EnvironmentThreadShell) => ({
  to: "/$environmentId/$threadId" as const,
  params: buildThreadRouteParams(scopeThreadRef(shell.environmentId, shell.id)),
});

function BoardCard({
  item,
  label,
  provider,
  onStart,
  onDelete,
}: {
  item: BoardItem;
  label: string;
  provider: ServerProvider | undefined;
  onStart: () => void;
  onDelete: () => void;
}) {
  const navigate = useNavigate();
  const archive = useOrchestrationCommand(threadEnvironment.archive, { reportFailure: true });
  const unarchive = useOrchestrationCommand(threadEnvironment.unarchive, { reportFailure: true });
  const { record, thread, lane } = item;
  const pullRequest = thread?.pullRequests.at(-1);
  const snapshot = pullRequest?.snapshot ?? null;
  const status = cardStatus(item.state);
  const pullRequestPresentation =
    pullRequest === undefined
      ? null
      : PULL_REQUEST_STATE_PRESENTATION[
          snapshot?.isDraft && snapshot.state === "open" ? "draft" : (snapshot?.state ?? "open")
        ];
  const archiveRequest = thread
    ? { environmentId: thread.environmentId, input: { threadId: thread.id } }
    : null;

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs">
      <div className="flex flex-col gap-1 px-3.5 pt-3 pb-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {provider ? (
            <ProviderInstanceIcon
              driverKind={provider.driver}
              displayName={provider.displayName ?? provider.driver}
              iconClassName="size-3.5"
            />
          ) : null}
          <span className="font-medium">{label}</span>
          <span className="ms-auto shrink-0">
            {formatRelativeTimeLabel(thread?.updatedAt ?? record.createdAt)}
          </span>
        </div>
        {thread ? (
          <Link
            {...threadLink(thread)}
            className="text-sm leading-snug font-semibold hover:underline"
          >
            {thread.title}
          </Link>
        ) : (
          <span className="text-sm leading-snug font-semibold">{record.title}</span>
        )}
        {record.details !== "" ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">{record.details}</p>
        ) : null}
        {pullRequest ? (
          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span className="truncate">{pullRequest.repository}</span>
            <span className="shrink-0">#{pullRequest.number}</span>
            {snapshot?.additions !== undefined && snapshot.deletions !== undefined ? (
              <>
                <span aria-hidden>·</span>
                <DiffStatLabel additions={snapshot.additions} deletions={snapshot.deletions} />
              </>
            ) : null}
          </div>
        ) : null}
        {thread?.branch ? (
          <div className="flex min-w-0 items-center gap-1.5 font-mono text-xs text-muted-foreground">
            <GitBranchIcon className="size-3 shrink-0" />
            <span className="truncate">{thread.branch}</span>
            {snapshot ? <span className="shrink-0">→ {snapshot.baseBranch}</span> : null}
          </div>
        ) : null}
      </div>
      <footer className="flex min-h-11 items-center gap-2 border-t bg-muted/40 px-3.5 py-2 text-xs">
        {status ? (
          <span
            className={cn("flex min-w-0 items-center gap-1.5 font-medium", TONE_CLASS[status.tone])}
          >
            {pullRequestPresentation && lane === "needs_review" ? (
              <pullRequestPresentation.Icon className="size-3.5 shrink-0" />
            ) : null}
            <span className="truncate">{status.text}</span>
          </span>
        ) : null}
        <div className="ms-auto flex shrink-0 items-center gap-1.5">
          {record.threadId === null ? (
            <>
              <Button size="xs" variant="destructive" onClick={onDelete}>
                Delete
              </Button>
              <Button size="xs" onClick={onStart}>
                Start
              </Button>
            </>
          ) : null}
          {thread && thread.archivedAt !== null && archiveRequest ? (
            <Button size="xs" variant="outline" onClick={() => void unarchive(archiveRequest)}>
              Restore
            </Button>
          ) : null}
          {thread && thread.archivedAt === null && lane === "needs_review" && archiveRequest ? (
            <>
              {pullRequest ? (
                <Button
                  size="xs"
                  variant="outline"
                  render={<a href={pullRequest.url} target="_blank" rel="noreferrer" />}
                >
                  View PR
                </Button>
              ) : (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => void navigate(threadLink(thread))}
                >
                  Open
                </Button>
              )}
              <Button size="xs" onClick={() => void archive(archiveRequest)}>
                Archive
              </Button>
            </>
          ) : null}
        </div>
      </footer>
    </article>
  );
}
