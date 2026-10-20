// Browser-safe incident rules.
export const SEVERITIES = ["low", "medium", "high", "critical"] as const;
export const STATUSES = ["open", "investigating", "mitigated", "resolved"] as const;
export type Status = (typeof STATUSES)[number];

/** Time to resolve in hours (1 decimal), null while unresolved. */
export function hoursToResolve(i: { created_at: string; resolved_at: string | null }): number | null {
  if (!i.resolved_at) return null;
  return Math.round(((new Date(i.resolved_at).getTime() - new Date(i.created_at).getTime()) / 3600_000) * 10) / 10;
}

/** Fields to write when the status changes: resolving stamps the time, reopening clears it. */
export function statusPatch(next: Status, now = new Date()) {
  return { status: next, resolved_at: next === "resolved" ? now.toISOString() : null, updated_at: now.toISOString() };
}
