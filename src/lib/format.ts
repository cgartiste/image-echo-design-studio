export const fmtNum = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));
export const fmtCompact = (n: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
export const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
export const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);
export const fmtPct = (v: number) => `${v.toFixed(1)}%`;
export const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Validate campaign HTML: unsubscribe link present and only known variables used. */
export const KNOWN_VARS = ["first_name", "last_name", "email", "unsubscribe_url", "country", "city", "list_name", "offer_name", "webview_url", "campaign_id", "from_name", "from_email", "subject"];
export function validateHtml(html: string) {
  const issues: string[] = [];
  if (!/\{\{unsubscribe_url\}\}|\[unsubscribe_url\]/.test(html)) issues.push("Missing mandatory {{unsubscribe_url}} link");
  const vars = [...html.matchAll(/\{\{\s*([^}]+?)\s*\}\}|\[([a-z_]+)\]/g)].map((m) => m[1] ?? m[2] ?? "");
  for (const v of new Set(vars)) if (v) if (!KNOWN_VARS.includes(v)) issues.push(`Unknown variable {{${v}}}`);
  const links = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1] ?? "");
  for (const l of links)
    if (!l || (!/^https?:\/\//.test(l) && !l.startsWith("{{") && !l.startsWith("[") && !l.startsWith("mailto:")))
      issues.push(`Invalid link: "${l || "(empty)"}"`);
  return issues;
}
