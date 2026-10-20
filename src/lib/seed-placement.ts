// Browser-safe helpers for Gmail seed (test inbox) placement.
export type Placement = "inbox" | "spam" | "promotions" | "updates" | "social" | "forums" | "trash" | "archived";

export function classifyPlacement(labelIds: string[] = []): Placement {
  const l = new Set(labelIds);
  if (l.has("SPAM")) return "spam";
  if (l.has("TRASH")) return "trash";
  if (l.has("CATEGORY_PROMOTIONS")) return "promotions";
  if (l.has("CATEGORY_UPDATES")) return "updates";
  if (l.has("CATEGORY_SOCIAL")) return "social";
  if (l.has("CATEGORY_FORUMS")) return "forums";
  if (l.has("INBOX")) return "inbox";
  return "archived";
}

/** Share of found messages that landed in the primary inbox (0-100), null when nothing was found. */
export function inboxRate(placements: Placement[]): number | null {
  if (!placements.length) return null;
  return Math.round((placements.filter((p) => p === "inbox").length / placements.length) * 100);
}

/** Gmail search query for a placement check. Quotes are stripped from user input. */
export function buildSeedQuery(opts: { subject?: string | undefined; from?: string | undefined; days: number }): string {
  const clean = (s: string) => s.replace(/["\\]/g, "").trim();
  const parts = ["in:anywhere", `newer_than:${Math.max(1, Math.min(30, Math.round(opts.days)))}d`];
  if (opts.subject && clean(opts.subject)) parts.push(`subject:"${clean(opts.subject)}"`);
  if (opts.from && clean(opts.from)) parts.push(`from:${clean(opts.from).replace(/\s+/g, "")}`);
  return parts.join(" ");
}

export const SEED_ACTIONS = ["rescue", "read", "star", "important", "archive", "trash"] as const;
export type SeedAction = (typeof SEED_ACTIONS)[number];

export function actionLabels(action: SeedAction): { add: string[]; remove: string[] } | "trash" {
  switch (action) {
    case "rescue": return { add: ["INBOX", "IMPORTANT"], remove: ["SPAM", "CATEGORY_PROMOTIONS"] };
    case "read": return { add: [], remove: ["UNREAD"] };
    case "star": return { add: ["STARRED"], remove: [] };
    case "important": return { add: ["IMPORTANT"], remove: [] };
    case "archive": return { add: [], remove: ["INBOX"] };
    case "trash": return "trash";
  }
}

export type PlacementSummary = { seeds: number; found: number; inbox: number; promotions: number; spam: number; other: number; missing: number };

/** Summarise one check: each seed counts once, using its most recent matching message. */
export function summarizePlacement(results: { messages: { placement: Placement }[]; error: string | null }[]): PlacementSummary {
  const s: PlacementSummary = { seeds: results.length, found: 0, inbox: 0, promotions: 0, spam: 0, other: 0, missing: 0 };
  for (const r of results) {
    const p = r.messages[0]?.placement;
    if (!p) { s.missing++; continue; }
    s.found++;
    if (p === "inbox") s.inbox++;
    else if (p === "promotions") s.promotions++;
    else if (p === "spam") s.spam++;
    else s.other++;
  }
  return s;
}
