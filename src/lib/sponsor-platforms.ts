// Browser-safe sponsor platform metadata, tracking links and suppression source detection.

export type LoginResult = "pending" | "submitted" | "success" | "failed" | "requires_2fa" | "requires_captcha" | "invalid_credentials" | "provider_unavailable" | "expired" | "unknown_error";
export const LOGIN_RESULTS: LoginResult[] = ["success", "failed", "requires_2fa", "requires_captcha", "invalid_credentials", "provider_unavailable", "unknown_error"];

export type Platform = {
  id: string;
  label: string;
  apiDriver: string;
  loginDriver: string;
  trackingFormat: string;
  supportsAutoLogin: boolean;
  supportsOffersImport: boolean;
  supportsConversions: boolean;
  supportsSuppression: boolean;
  requiresCaptcha?: boolean;
  requiresTwoFactor?: boolean;
  apiHint: string;
  driverVersion: string;
};

export const PLATFORMS: Record<string, Platform> = {
  everflow: { id: "everflow", label: "Everflow", apiDriver: "everflow", loginDriver: "everflow", trackingFormat: "?sub1=[user]&sub2=[offer]-[campaign]&sub3=[list]-[email]-[interface]", supportsAutoLogin: true, supportsOffersImport: true, supportsConversions: true, supportsSuppression: true, apiHint: "API key from Everflow → Affiliate → API. API URL defaults to https://api.eflow.team", driverVersion: "2.0" },
  cake: { id: "cake", label: "Cake", apiDriver: "cake", loginDriver: "cake", trackingFormat: "&s1=[user]&s2=[offer]-[campaign]&s3=[list]-[email]-[interface]", supportsAutoLogin: true, supportsOffersImport: true, supportsConversions: true, supportsSuppression: true, apiHint: "API key + affiliate ID. API URL = your network domain, e.g. https://network.com", driverVersion: "2.0" },
  hasoffers: { id: "hasoffers", label: "HasOffers / TUNE", apiDriver: "hasoffers", loginDriver: "hasoffers", trackingFormat: "&aff_sub=[user]&aff_sub2=[offer]-[campaign]&aff_sub3=[list]-[email]-[interface]", supportsAutoLogin: true, supportsOffersImport: true, supportsConversions: true, supportsSuppression: false, apiHint: "Affiliate API key. API URL = https://NETWORKID.api.hasoffers.com", driverVersion: "2.0" },
  hitpath: { id: "hitpath", label: "HitPath", apiDriver: "hitpath", loginDriver: "hitpath", trackingFormat: "/[user]/[offer]-[campaign]/[list]-[email]-[interface]", supportsAutoLogin: true, supportsOffersImport: true, supportsConversions: true, supportsSuppression: true, apiHint: "API key. API URL = full HitPath API endpoint given by your network (JSON output).", driverVersion: "2.0" },
  clickdealer: { id: "clickdealer", label: "ClickDealer (Cake)", apiDriver: "cake", loginDriver: "cake", trackingFormat: "&s1=[user]&s2=[offer]-[campaign]&s3=[list]-[email]-[interface]", supportsAutoLogin: true, supportsOffersImport: true, supportsConversions: true, supportsSuppression: true, apiHint: "Cake-based. API key + affiliate ID.", driverVersion: "2.0" },
  affise: { id: "affise", label: "Affise", apiDriver: "affise", loginDriver: "none", trackingFormat: "&sub1=[user]&sub2=[offer]-[campaign]&sub3=[list]-[email]-[interface]", supportsAutoLogin: false, supportsOffersImport: true, supportsConversions: true, supportsSuppression: false, apiHint: "API key. API URL = https://api-NETWORK.affise.com", driverVersion: "1.0" },
  w4: { id: "w4", label: "W4", apiDriver: "none", loginDriver: "w4", trackingFormat: "?sub1=[user]&sub2=[offer]-[campaign]&sub3=[list]-[email]-[interface]", supportsAutoLogin: true, supportsOffersImport: false, supportsConversions: false, supportsSuppression: false, apiHint: "Auto-login only.", driverVersion: "1.0" },
  bluestats: { id: "bluestats", label: "BlueStats", apiDriver: "none", loginDriver: "bluestats", trackingFormat: "?s1=[user]&s2=[offer]-[campaign]&s3=[list]-[email]-[interface]", supportsAutoLogin: true, supportsOffersImport: false, supportsConversions: false, supportsSuppression: false, apiHint: "Auto-login only.", driverVersion: "1.0" },
  gasmobi: { id: "gasmobi", label: "Gasmobi", apiDriver: "none", loginDriver: "none", trackingFormat: "&sub1=[user]&sub2=[offer]-[campaign]&sub3=[list]-[email]-[interface]", supportsAutoLogin: false, supportsOffersImport: false, supportsConversions: false, supportsSuppression: false, apiHint: "Manual offers only for now.", driverVersion: "1.0" },
};

/** Login drivers: form field names posted to the sponsor login page. */
export const LOGIN_DRIVERS: Record<string, { label: string; fields: (u: string, p: string) => Record<string, string>; urlSuffix?: string }> = {
  none: { label: "None", fields: () => ({}) },
  cake: { label: "Cake", fields: (u, p) => ({ u, p }), urlSuffix: "?tp=1" },
  hitpath: { label: "HitPath", fields: (u, p) => ({ utype: "agent", action: "login", uname: u, pword: p }) },
  hasoffers: { label: "HasOffers", fields: (u, p) => ({ "data[User][email]": u, "data[User][password]": p }) },
  everflow: { label: "Everflow", fields: (u, p) => ({ email: u, password: p }) },
  w4: { label: "W4", fields: (u, p) => ({ email: u, password: p }) },
  bluestats: { label: "BlueStats", fields: (u, p) => ({ username: u, password: p }) },
};

export const SPONSOR_TEMPLATES: { name: string; platform: string; api_url?: string; login_url?: string }[] = [
  { name: "Cx3 Ads", platform: "cake" }, { name: "Lola Leads", platform: "everflow", api_url: "https://api.eflow.team" },
  { name: "Global Wide Media", platform: "hitpath" }, { name: "Load Smooth", platform: "everflow", api_url: "https://api.eflow.team" },
  { name: "W4", platform: "w4" }, { name: "iDrive", platform: "cake" }, { name: "Bizaglo", platform: "everflow", api_url: "https://api.eflow.team" },
  { name: "Madrivo", platform: "everflow", api_url: "https://api.eflow.team" }, { name: "B2Direct", platform: "cake" },
  { name: "All Everflow Platforms", platform: "everflow", api_url: "https://api.eflow.team" }, { name: "AdSurf Network", platform: "hitpath" },
  { name: "Gasmobi", platform: "gasmobi" }, { name: "ClickDealer", platform: "clickdealer" },
  { name: "LeadsDivision", platform: "everflow", api_url: "https://api.eflow.team" }, { name: "ProfityAds", platform: "hasoffers" },
];

export type TrackingVars = { user?: string; offer?: string; campaign?: string; sponsor?: string; list?: string; email?: string; interface?: string };

export function renderTracking(template: string, v: TrackingVars) {
  return template.replace(/\[(user|offer|campaign|sponsor|list|email|interface)\]/g, (_, k: keyof TrackingVars) => encodeURIComponent(v[k] ?? ""));
}

export function buildTrackingLink(baseUrl: string, template: string, v: TrackingVars) {
  const suffix = renderTracking(template, v);
  if (suffix.startsWith("/")) return baseUrl.replace(/\/+$/, "") + suffix;
  if (suffix.startsWith("?") && baseUrl.includes("?")) return baseUrl + "&" + suffix.slice(1);
  if (suffix.startsWith("&") && !baseUrl.includes("?")) return baseUrl + "?" + suffix.slice(1);
  return baseUrl + suffix;
}

export function validateTrackingTemplate(template: string) {
  const errors: string[] = [];
  for (const k of ["user", "offer", "campaign", "list", "email"]) if (!template.includes(`[${k}]`)) errors.push(`Missing [${k}]`);
  const unknown = (template.match(/\[([a-z_]+)\]/g) ?? []).filter((m) => !/^\[(user|offer|campaign|sponsor|list|email|interface)\]$/.test(m));
  if (unknown.length) errors.push(`Unknown variables: ${unknown.join(", ")}`);
  return errors;
}

/** Parse sub values (sub1=user, sub2=offer-campaign, sub3=list-email-interface) back into references. */
export function parseSubs(sub1?: string | null, sub2?: string | null, sub3?: string | null) {
  const [offer, campaign] = (sub2 ?? "").split("-");
  const [list, email, iface] = (sub3 ?? "").split("-");
  return { user: sub1 || null, offer: offer || null, campaign: campaign || null, list: list || null, email: email || null, interface: iface || null };
}

export function detectSuppressionSource(url: string): "optizmo" | "google_sheets" | "dropbox" | "direct" {
  const u = url.toLowerCase();
  if (u.includes("optizmo")) return "optizmo";
  if (u.includes("docs.google.com/spreadsheets")) return "google_sheets";
  if (u.includes("dropbox.com")) return "dropbox";
  return "direct";
}

export function suppressionDownloadUrl(url: string) {
  const type = detectSuppressionSource(url);
  if (type === "google_sheets") {
    const id = url.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1];
    return id ? `https://docs.google.com/spreadsheets/d/${id}/export?format=csv` : url;
  }
  if (type === "dropbox") return url.replace(/([?&])dl=0/, "$1dl=1").concat(url.includes("dl=") ? "" : (url.includes("?") ? "&dl=1" : "?dl=1"));
  return url;
}
