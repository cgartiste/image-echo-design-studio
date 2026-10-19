export type CampaignStatus =
  | "draft" | "scheduled" | "running" | "paused" | "completed" | "failed" | "cancelled" | "archived";

export const CAMPAIGN_STATUSES: CampaignStatus[] = [
  "draft", "scheduled", "running", "paused", "completed", "failed", "cancelled", "archived",
];

export type CampaignAction = "schedule" | "start" | "pause" | "resume" | "stop" | "cancel" | "archive";

const TRANSITIONS: Record<CampaignAction, { from: CampaignStatus[]; to: CampaignStatus }> = {
  schedule: { from: ["draft"], to: "scheduled" },
  start: { from: ["draft", "scheduled"], to: "running" },
  pause: { from: ["running"], to: "paused" },
  resume: { from: ["paused"], to: "running" },
  stop: { from: ["running", "paused"], to: "completed" },
  cancel: { from: ["scheduled", "running", "paused"], to: "cancelled" },
  archive: { from: ["draft", "completed", "failed", "cancelled"], to: "archived" },
};

export function availableActions(status: CampaignStatus): CampaignAction[] {
  return (Object.keys(TRANSITIONS) as CampaignAction[]).filter((a) => TRANSITIONS[a].from.includes(status));
}

export function nextStatus(status: CampaignStatus, action: CampaignAction): CampaignStatus {
  const t = TRANSITIONS[action];
  if (!t.from.includes(status)) throw new Error(`Cannot ${action} a ${status} campaign`);
  return t.to;
}
