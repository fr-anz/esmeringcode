import { createFileRoute } from "@tanstack/react-router";

import { WorkerRolesSettings } from "../components/settings/WorkerRolesSettings";

export const Route = createFileRoute("/_chat/settings/worker-roles")({
  component: WorkerRolesSettings,
});
