export type CampaignStatus =
  | "draft" | "ready" | "scheduled" | "publishing" | "running" | "paused" | "stopping" | "stopped" | "completed" | "failed" | "cancelled" | "archived" | "test" | "waiting_approval";

export const CAMPAIGN_STATUSES: CampaignStatus[] = [
  "draft", "ready", "scheduled", "publishing", "running", "paused", "stopping", "stopped", "completed", "failed", "cancelled", "archived", "test", "waiting_approval",
];

export type CampaignAction = "schedule" | "start" | "pause" | "resume" | "stop" | "cancel" | "archive";

const TRANSITIONS: Record<CampaignAction, { from: CampaignStatus[]; to: CampaignStatus }> = {
  schedule: { from: ["draft", "ready"], to: "scheduled" },
  start: { from: ["draft", "ready", "scheduled", "publishing"], to: "running" },
  pause: { from: ["running"], to: "paused" },
  resume: { from: ["paused"], to: "running" },
  stop: { from: ["running", "paused", "stopping"], to: "stopped" },
  cancel: { from: ["ready", "scheduled", "publishing", "running", "paused", "waiting_approval"], to: "cancelled" },
  archive: { from: ["draft", "ready", "test", "stopped", "completed", "failed", "cancelled"], to: "archived" },
};

export function availableActions(status: CampaignStatus): CampaignAction[] {
  return (Object.keys(TRANSITIONS) as CampaignAction[]).filter((a) => TRANSITIONS[a].from.includes(status));
}

export function nextStatus(status: CampaignStatus, action: CampaignAction): CampaignStatus {
  const t = TRANSITIONS[action];
  if (!t.from.includes(status)) throw new Error(`Cannot ${action} a ${status} campaign`);
  return t.to;
}

export function canEditCampaign(status: CampaignStatus) {
  return ["draft", "ready", "test", "waiting_approval"].includes(status);
}
