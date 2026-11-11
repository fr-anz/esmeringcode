import {
  DEFAULT_WORKER_ROLES,
  WorkerRoleId,
  type WorkerRole,
  type WorkerRoleIsolation,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as Schema from "effect/Schema";
import { PlusIcon, Trash2Icon } from "lucide-react";

import { providerInstanceEntriesFor } from "../../providerInstances";
import { getCustomModelOptionsByInstance } from "../../modelSelection";
import { useEnvironmentProviders } from "../../state/environments";
import { EMPTY_SERVER_PROVIDERS } from "../../state/server";
import { ProviderModelPicker } from "../chat/ProviderModelPicker";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { toastManager } from "../ui/toast";
import {
  SETTINGS_PICKER_TRIGGER_CLASSNAME,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "./settingsLayout";
import { useSettingsScope } from "./SettingsScopeContext";
import { useScopedSettings, useUpdateScopedSettings } from "./useScopedSettings";

const ISOLATION_LABELS: Record<WorkerRoleIsolation, string> = {
  shared: "Orchestrator's checkout",
  worktree: "Own worktree",
};
const isWorkerRoleId = Schema.is(WorkerRoleId);

const nextRoleId = (roles: ReadonlyArray<WorkerRole>) => {
  let index = roles.length + 1;
  while (roles.some((role) => role.id === `role-${index}`)) index += 1;
  return `role-${index}`;
};

export function WorkerRolesSettings() {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const { environment, target } = useSettingsScope();
  const environmentId = environment?.environmentId ?? null;
  const providersByEnvironment = useEnvironmentProviders();
  const providers =
    (environment?.serverConfig
      ? providersByEnvironment.get(environment.environmentId)
      : undefined) ?? EMPTY_SERVER_PROVIDERS;
  const instanceEntries = providerInstanceEntriesFor(
    providers,
    settings,
    target?.projectId ?? null,
  );
  const roles = settings.workerRoles;

  const save = (next: ReadonlyArray<WorkerRole>) => updateSettings({ workerRoles: next });
  const patchRole = (id: string, patch: Partial<WorkerRole>) =>
    save(roles.map((role) => (role.id === id ? { ...role, ...patch } : role)));
  const seedSelection = () => {
    if (settings.defaultModelSelection) return settings.defaultModelSelection;
    const entry = instanceEntries.find((candidate) => candidate.enabled && candidate.isAvailable);
    const model = entry?.models[0];
    return entry && model ? createModelSelection(entry.instanceId, model.slug) : null;
  };

  return (
    <SettingsPageContainer>
      <SettingsSection
        title="Worker roles"
        headerAction={
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => save(DEFAULT_WORKER_ROLES)}>
              Reset to defaults
            </Button>
            <Button
              size="sm"
              onClick={() =>
                save([
                  ...roles,
                  {
                    id: nextRoleId(roles),
                    label: "New role",
                    description: "",
                    instructions: "",
                    modelSelection: null,
                    isolation: "shared",
                  },
                ])
              }
            >
              <PlusIcon />
              Add role
            </Button>
          </div>
        }
      >
        <SettingsRow
          title="How roles work"
          description="An orchestrating agent delegates work by role. Each role runs on its own provider and model, so every role uses the subscription you pick for it. Roles without a model use the orchestrator's."
        />
      </SettingsSection>

      {roles.map((role) => {
        const selection = role.modelSelection;
        const modelOptionsByInstance = getCustomModelOptionsByInstance(
          settings,
          providers,
          selection?.instanceId ?? null,
          selection?.model ?? null,
        );
        return (
          <SettingsSection
            key={role.id}
            title={role.label}
            headerAction={
              <Button
                size="icon-sm"
                variant="ghost-destructive"
                aria-label={`Delete ${role.label}`}
                onClick={() => save(roles.filter((candidate) => candidate.id !== role.id))}
              >
                <Trash2Icon />
              </Button>
            }
          >
            <SettingsRow
              title="Name and id"
              description="The orchestrator passes the id as `role` to delegate_task."
              control={
                <div className="flex gap-2">
                  <Input
                    key={`label:${role.label}`}
                    size="sm"
                    className="w-36"
                    aria-label="Role name"
                    defaultValue={role.label}
                    onBlur={(event) => {
                      const label = event.currentTarget.value.trim();
                      if (label !== "" && label !== role.label) patchRole(role.id, { label });
                    }}
                  />
                  <Input
                    key={`id:${role.id}`}
                    size="sm"
                    className="w-28"
                    aria-label="Role id"
                    defaultValue={role.id}
                    onBlur={(event) => {
                      const id = event.currentTarget.value.trim();
                      if (id === role.id) return;
                      if (!isWorkerRoleId(id) || roles.some((candidate) => candidate.id === id)) {
                        event.currentTarget.value = role.id;
                        toastManager.add({
                          type: "error",
                          title: "Role id not saved",
                          description:
                            "Use a unique id of lowercase letters, digits, dashes, or underscores.",
                        });
                        return;
                      }
                      patchRole(role.id, { id });
                    }}
                  />
                </div>
              }
            />
            <SettingsRow
              title="Model"
              description="Off uses the orchestrator's provider and model."
              control={
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {selection ? (
                    <ProviderModelPicker
                      environmentId={environmentId}
                      activeInstanceId={selection.instanceId}
                      model={selection.model}
                      lockedProvider={null}
                      instanceEntries={instanceEntries}
                      modelOptionsByInstance={modelOptionsByInstance}
                      triggerClassName={SETTINGS_PICKER_TRIGGER_CLASSNAME}
                      triggerAriaLabel={`${role.label} model`}
                      onInstanceModelChange={(instanceId, model) =>
                        patchRole(role.id, {
                          modelSelection: createModelSelection(instanceId, model),
                        })
                      }
                    />
                  ) : null}
                  <Switch
                    checked={selection !== null}
                    aria-label={`${role.label} uses its own model`}
                    onCheckedChange={(checked) => {
                      if (!checked) return patchRole(role.id, { modelSelection: null });
                      const seed = seedSelection();
                      if (seed) patchRole(role.id, { modelSelection: seed });
                    }}
                  />
                </div>
              }
            />
            <SettingsRow
              title="Checkout"
              description="Implementers usually get their own worktree so their commits stay separate."
              control={
                <Select
                  value={role.isolation}
                  onValueChange={(value) => {
                    if (value === "shared" || value === "worktree")
                      patchRole(role.id, { isolation: value });
                  }}
                >
                  <SelectTrigger size="sm" className="w-full sm:w-48" aria-label="Checkout">
                    <SelectValue>{ISOLATION_LABELS[role.isolation]}</SelectValue>
                  </SelectTrigger>
                  <SelectPopup align="end" alignItemWithTrigger={false}>
                    {(["shared", "worktree"] as const).map((value) => (
                      <SelectItem key={value} value={value}>
                        {ISOLATION_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              }
            />
            <SettingsRow
              title="Description"
              description="Shown to the orchestrator when it picks a role."
            >
              <Input
                key={`description:${role.description}`}
                size="sm"
                aria-label={`${role.label} description`}
                defaultValue={role.description}
                onBlur={(event) => {
                  const description = event.currentTarget.value.trim();
                  if (description !== role.description) patchRole(role.id, { description });
                }}
              />
            </SettingsRow>
            <SettingsRow title="Instructions" description="Added before every task this role gets.">
              <Textarea
                key={`instructions:${role.instructions}`}
                aria-label={`${role.label} instructions`}
                rows={4}
                defaultValue={role.instructions}
                onBlur={(event) => {
                  const instructions = event.currentTarget.value.trim();
                  if (instructions !== role.instructions) patchRole(role.id, { instructions });
                }}
              />
            </SettingsRow>
          </SettingsSection>
        );
      })}
    </SettingsPageContainer>
  );
}
