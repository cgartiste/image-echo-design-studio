// Minimal translation layer. Add a `fr` dictionary with the same keys to enable French.
const en = {
  "nav.dashboard": "Dashboard",
  "nav.campaigns": "Campaigns",
  "nav.calendar": "Calendar",
  "nav.templates": "Templates",
  "nav.followups": "Follow-ups",
  "nav.insights": "AI insights",
  "nav.placement": "Placement reports",
  "nav.lists": "Email Lists",
  "nav.activity": "Activity Log",
  "nav.profile": "Profile",
  "nav.segments": "Segments",
  "nav.abtests": "A/B Tests",
  "nav.offers": "Networks & Offers",
  "nav.domains": "Domains & DNS",
  "nav.servers": "Delivery Servers",
  "nav.powermta": "PowerMTA",
  "nav.taxonomy": "Tags & Categories",
  "nav.suppression": "Suppression",
  "nav.vip": "VIP Clients",
  "nav.deliverability": "Deliverability",
  "nav.team": "Team",
  "common.soon": "Soon",
  "common.demo": "Demo mode",
  "campaign.general": "General & audience",
  "campaign.message": "Email structure",
  "campaign.delivery": "Deliverability",
  "campaign.save": "Save",
  "campaign.publish": "Save & Publish",
  "campaign.configs": "Saved configs",
  "campaign.test": "Test mode",
  "campaign.disconnected": "No online KumoMTA server for this campaign",
  "campaign.recipients": "Recipient count",
  "campaign.preview": "Preview",
  "campaign.checklist": "Publication checklist",
  "campaign.include": "Include lists",
  "campaign.exclude": "Exclude lists",
  "campaign.offer": "Partner offer",
  "campaign.headers": "Message headers",
  "campaign.html": "HTML creative",
  "campaign.text": "Text version",
  "campaign.tracking": "Tracking & footer",
  "campaign.smart": "Smart Links",
  "campaign.variants": "A/B variant",
  "campaign.servers": "Delivery servers",
  "campaign.interfaces": "Sending interfaces",
  "campaign.queue": "Queue",
  "campaign.realtime": "Real-time configuration",
  "campaign.locked": "Content locked for this campaign status",
  "campaign.countUnavailable": "Recipient count unavailable",
} as const;

export type TKey = keyof typeof en;
const dictionaries: Record<string, Partial<Record<TKey, string>>> = { en };
let locale = "en";

export function setLocale(l: string) {
  locale = l;
}
export function t(key: TKey): string {
  return dictionaries[locale]?.[key] ?? en[key];
}
