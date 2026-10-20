export type SegmentRules = {
  lists?: string[];
  countries?: string[];
  languages?: string[];
  tags_any?: string[];
  tags_none?: string[];
  engagement_min?: number;
  engagement_max?: number;
  opened_within_days?: number;
  clicked_within_days?: number;
  inactive_days?: number;
  not_sent_within_days?: number;
  subscribed_within_days?: number;
  max_bounces?: number;
};

/** Drops empty values so the database evaluator only sees active rules. */
export function cleanRules(r: SegmentRules): SegmentRules {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) {
    if (Array.isArray(v)) { if (v.length) out[k] = v; }
    else if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[k] = Math.round(v);
  }
  return out as SegmentRules;
}

export function describeRules(r: SegmentRules, listName: (id: string) => string): string[] {
  const d: string[] = [];
  if (r.lists?.length) d.push(`Lists: ${r.lists.map(listName).join(", ")}`);
  if (r.countries?.length) d.push(`Country: ${r.countries.join(", ")}`);
  if (r.languages?.length) d.push(`Language: ${r.languages.join(", ")}`);
  if (r.tags_any?.length) d.push(`Tagged: ${r.tags_any.join(" or ")}`);
  if (r.tags_none?.length) d.push(`Not tagged: ${r.tags_none.join(", ")}`);
  if (r.engagement_min != null) d.push(`Engagement ≥ ${r.engagement_min}`);
  if (r.engagement_max != null) d.push(`Engagement ≤ ${r.engagement_max}`);
  if (r.opened_within_days != null) d.push(`Opened in last ${r.opened_within_days} days`);
  if (r.clicked_within_days != null) d.push(`Clicked in last ${r.clicked_within_days} days`);
  if (r.inactive_days != null) d.push(`Inactive ${r.inactive_days}+ days`);
  if (r.not_sent_within_days != null) d.push(`Not emailed for ${r.not_sent_within_days} days`);
  if (r.subscribed_within_days != null) d.push(`Joined in last ${r.subscribed_within_days} days`);
  if (r.max_bounces != null) d.push(`≤ ${r.max_bounces} bounces`);
  return d.length ? d : ["All active contacts"];
}
