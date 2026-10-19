// Minimal translation layer. Add a `fr` dictionary with the same keys to enable French.
const en = {
  "nav.dashboard": "Dashboard",
  "nav.campaigns": "Campaigns",
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
  "common.soon": "Soon",
  "common.demo": "Demo mode",
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
