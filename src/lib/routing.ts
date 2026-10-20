// SES account routing: decides which accounts may carry a campaign, in order.
export type RoutableAccount = {
  id: string;
  name: string;
  is_vip: boolean;
  pool_status: string;
  status: string;
  routing_priority: number;
  daily_quota: number | null;
  sent_today: number;
  bounce_rate: number | null;
  complaint_rate: number | null;
};
export type Thresholds = { bounce: number; complaint: number };
export type RouteRequest = { volume: number; vipClient?: { ses_account_id: string | null; backup_account_id: string | null } | null };
export type RouteStep = { account: RoutableAccount; role: "primary" | "backup" | "pool"; remaining: number | null };
export type RouteRejection = { account: RoutableAccount; reason: string };

export function remaining(a: RoutableAccount): number | null {
  return a.daily_quota == null ? null : Math.max(0, a.daily_quota - a.sent_today);
}

/** Why an account cannot carry traffic right now, or null when it can. */
export function blockReason(a: RoutableAccount, t: Thresholds): string | null {
  if (["suspended", "maintenance", "error", "pending"].includes(a.pool_status)) return `Account is ${a.pool_status}`;
  if (a.status === "error") return "Last AWS sync failed";
  if (remaining(a) === 0) return "Daily quota reached";
  if (a.bounce_rate != null && a.bounce_rate >= t.bounce) return `Bounce rate ${a.bounce_rate}% ≥ ${t.bounce}%`;
  if (a.complaint_rate != null && a.complaint_rate >= t.complaint) return `Complaint rate ${a.complaint_rate}% ≥ ${t.complaint}%`;
  return null;
}

/**
 * VIP clients use only their primary then backup account.
 * Standard campaigns never touch VIP accounts and use the pool by priority.
 */
export function planRoute(accounts: RoutableAccount[], req: RouteRequest, t: Thresholds) {
  const plan: RouteStep[] = [];
  const rejected: RouteRejection[] = [];
  const consider = (a: RoutableAccount | undefined, role: RouteStep["role"]) => {
    if (!a) return;
    const why = blockReason(a, t);
    if (why) rejected.push({ account: a, reason: why });
    else plan.push({ account: a, role, remaining: remaining(a) });
  };
  if (req.vipClient) {
    consider(accounts.find((a) => a.id === req.vipClient!.ses_account_id), "primary");
    consider(accounts.find((a) => a.id === req.vipClient!.backup_account_id), "backup");
  } else {
    [...accounts].filter((a) => !a.is_vip).sort((a, b) => a.routing_priority - b.routing_priority).forEach((a) => consider(a, "pool"));
  }
  let capacity: number | null = 0;
  for (const s of plan) capacity = capacity == null || s.remaining == null ? null : capacity + s.remaining;
  return { plan, rejected, capacity, enough: capacity == null || capacity >= req.volume };
}
