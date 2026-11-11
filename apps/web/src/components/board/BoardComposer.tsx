import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import type { ModelSelection } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { ArrowUpIcon } from "lucide-react";
import { useState, type RefObject } from "react";

import { useEnvironmentSettings } from "../../hooks/useSettings";
import { getCustomModelOptionsByInstance } from "../../modelSelection";
import { providerInstanceEntriesFor } from "../../providerInstances";
import { useEnvironmentProviders } from "../../state/environments";
import { EMPTY_SERVER_PROVIDERS } from "../../state/server";
import { ProviderModelPicker } from "../chat/ProviderModelPicker";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import type { useBoardOrchestrator } from "./useBoardOrchestrator";

/** The board's only input: a chat with the project's orchestrator. */
export function BoardComposer({
  project,
  textareaRef,
  orchestrator,
  boardSnapshot,
}: {
  project: EnvironmentProject;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  orchestrator: ReturnType<typeof useBoardOrchestrator>;
  boardSnapshot: string;
}) {
  const settings = useEnvironmentSettings(project.environmentId);
  const providers = useEnvironmentProviders().get(project.environmentId) ?? EMPTY_SERVER_PROVIDERS;
  const instanceEntries = providerInstanceEntriesFor(providers, settings, project.id);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [chosenModel, setChosenModel] = useState<ModelSelection | null>(null);
  const { thread } = orchestrator;
  const fallbackEntry = instanceEntries.find((entry) => entry.enabled && entry.isAvailable);
  const fallbackModel = fallbackEntry?.models[0];
  const shownModel =
    chosenModel ??
    thread?.modelSelection ??
    settings.defaultModelSelection ??
    (fallbackEntry && fallbackModel
      ? createModelSelection(fallbackEntry.instanceId, fallbackModel.slug)
      : null);
  const message = text.trim();
  const canSend = !submitting && message !== "" && shownModel !== null;

  const send = async () => {
    if (!canSend) return;
    setSubmitting(true);
    const sent = await orchestrator.send({
      message,
      boardSnapshot,
      // A new orchestrator needs a model; an existing one keeps its own unless changed here.
      modelSelection: thread === null ? shownModel : chosenModel,
    });
    setSubmitting(false);
    if (!sent) return;
    setText("");
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
      <form
        className="pointer-events-auto flex w-full max-w-2xl flex-col gap-2 rounded-xl border bg-popover p-2 shadow-lg"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <Textarea
          ref={textareaRef}
          aria-label="Message the orchestrator"
          placeholder="Message the orchestrator or describe work to plan…"
          rows={2}
          value={text}
          onChange={(event) => setText(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <div className="flex items-center gap-2">
          {shownModel ? (
            <ProviderModelPicker
              environmentId={project.environmentId}
              activeInstanceId={shownModel.instanceId}
              model={shownModel.model}
              lockedProvider={null}
              instanceEntries={instanceEntries}
              modelOptionsByInstance={getCustomModelOptionsByInstance(
                settings,
                providers,
                shownModel.instanceId,
                shownModel.model,
              )}
              triggerAriaLabel="Orchestrator model"
              onInstanceModelChange={(instanceId, model) =>
                setChosenModel(createModelSelection(instanceId, model))
              }
            />
          ) : (
            <span className="text-xs text-muted-foreground">Set up a provider to plan work.</span>
          )}
          <div className="ms-auto flex items-center gap-2">
            <Button size="icon-sm" type="submit" disabled={!canSend} aria-label="Send">
              <ArrowUpIcon />
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
