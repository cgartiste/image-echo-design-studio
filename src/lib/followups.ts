// Browser-safe follow-up rules.
export const AUDIENCES = { non_openers: "Did not open", openers: "Opened", clickers: "Clicked", non_clickers: "Opened but did not click" } as const;
export type Audience = keyof typeof AUDIENCES;

/** When a follow-up becomes due: parent end (or start) + delay. Null while the parent hasn't been sent. */
export function followupDueAt(parent: { started_at: string | null; ended_at: string | null }, delayHours: number): Date | null {
  const base = parent.ended_at ?? parent.started_at;
  return base ? new Date(new Date(base).getTime() + delayHours * 3600_000) : null;
}

/** Estimated audience size from parent stats. */
export function estimateAudience(a: Audience, p: { delivered: number; opens: number; clicks: number }): number {
  switch (a) {
    case "non_openers": return Math.max(0, p.delivered - p.opens);
    case "openers": return p.opens;
    case "clickers": return p.clicks;
    case "non_clickers": return Math.max(0, p.opens - p.clicks);
  }
}
