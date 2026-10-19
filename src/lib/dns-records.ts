// Pure, client-safe DNS helpers: record templates and deliverability scoring.

export type DnsRecord = { id?: string; type: string; name: string; content: string; ttl: number; priority?: number };

export type CheckKey = "spf" | "dkim" | "dmarc" | "mx" | "mta_sts" | "tls_rpt" | "bimi" | "return_path";
export type CheckResult = { ok: boolean; value: string | null; issue?: string };
export type DomainChecks = Partial<Record<CheckKey, CheckResult>>;

export const CHECK_WEIGHTS: Record<CheckKey, number> = {
  spf: 25, dkim: 25, dmarc: 25, mx: 10, mta_sts: 5, tls_rpt: 5, bimi: 3, return_path: 2,
};
export const REQUIRED_CHECKS: CheckKey[] = ["spf", "dkim", "dmarc"];

export function scoreChecks(c: DomainChecks) {
  let score = 0;
  for (const k of Object.keys(CHECK_WEIGHTS) as CheckKey[]) if (c[k]?.ok) score += CHECK_WEIGHTS[k];
  const verified = REQUIRED_CHECKS.every((k) => c[k]?.ok);
  return { score, status: verified ? "verified" : "action_required" };
}

export function evaluateSpf(txts: string[]): CheckResult {
  const spf = txts.filter((t) => t.toLowerCase().startsWith("v=spf1"));
  if (spf.length === 0) return { ok: false, value: null, issue: "No SPF record" };
  if (spf.length > 1) return { ok: false, value: spf.join(" | "), issue: "Multiple SPF records (must be exactly one)" };
  const v = spf[0]!;
  if (/\+all\b/.test(v)) return { ok: false, value: v, issue: "SPF uses +all (allows anyone to send)" };
  const lookups = (v.match(/\b(include:|a\b|a:|mx\b|mx:|exists:|redirect=)/g) ?? []).length;
  if (lookups > 10) return { ok: false, value: v, issue: `Too many DNS lookups (${lookups} > 10)` };
  return { ok: true, value: v };
}

export function evaluateDmarc(txts: string[]): CheckResult {
  const d = txts.find((t) => t.toUpperCase().startsWith("V=DMARC1"));
  if (!d) return { ok: false, value: null, issue: "No DMARC record" };
  const p = /;\s*p=(\w+)/i.exec(d)?.[1]?.toLowerCase();
  if (!p) return { ok: false, value: d, issue: "DMARC missing p= policy" };
  return { ok: true, value: d, ...(p === "none" ? { issue: "Policy p=none (monitoring only)" } : {}) };
}

export function evaluateDkim(txts: string[]): CheckResult {
  const k = txts.find((t) => /(^|;)\s*p=[A-Za-z0-9+/=]{100,}/.test(t));
  return k ? { ok: true, value: k.slice(0, 80) + "…" } : { ok: false, value: null, issue: "No DKIM public key for this selector" };
}

export type TemplateOptions = {
  spf?: { ips: string[]; includes: string[]; policy: "~all" | "-all" };
  dkim?: { selector: string; publicKey: string };
  dmarc?: { policy: "none" | "quarantine" | "reject"; rua?: string; pct?: number };
  mtaSts?: { id: string };
  tlsRpt?: { rua: string };
  bimi?: { logoUrl: string };
  returnPath?: { sub: string; target: string };
  mx?: { host: string; priority: number };
};

/** Build the records to publish for an email sending domain. */
export function buildRecords(domain: string, o: TemplateOptions, ttl = 3600): DnsRecord[] {
  const out: DnsRecord[] = [];
  if (o.spf) {
    const parts = ["v=spf1", ...o.spf.ips.map((ip) => (ip.includes(":") ? `ip6:${ip}` : `ip4:${ip}`)), ...o.spf.includes.map((i) => `include:${i}`), o.spf.policy];
    out.push({ type: "TXT", name: domain, content: parts.join(" "), ttl });
  }
  if (o.dkim) out.push({ type: "TXT", name: `${o.dkim.selector}._domainkey.${domain}`, content: `v=DKIM1; k=rsa; p=${o.dkim.publicKey}`, ttl });
  if (o.dmarc) {
    const tags = [`v=DMARC1`, `p=${o.dmarc.policy}`];
    if (o.dmarc.pct != null && o.dmarc.pct < 100) tags.push(`pct=${o.dmarc.pct}`);
    if (o.dmarc.rua) tags.push(`rua=mailto:${o.dmarc.rua}`);
    tags.push("adkim=r", "aspf=r");
    out.push({ type: "TXT", name: `_dmarc.${domain}`, content: tags.join("; "), ttl });
  }
  if (o.mtaSts) out.push({ type: "TXT", name: `_mta-sts.${domain}`, content: `v=STSv1; id=${o.mtaSts.id}`, ttl });
  if (o.tlsRpt) out.push({ type: "TXT", name: `_smtp._tls.${domain}`, content: `v=TLSRPTv1; rua=mailto:${o.tlsRpt.rua}`, ttl });
  if (o.bimi) out.push({ type: "TXT", name: `default._bimi.${domain}`, content: `v=BIMI1; l=${o.bimi.logoUrl}`, ttl });
  if (o.returnPath) out.push({ type: "CNAME", name: `${o.returnPath.sub}.${domain}`, content: o.returnPath.target, ttl });
  if (o.mx) out.push({ type: "MX", name: domain, content: o.mx.host, ttl, priority: o.mx.priority });
  return out;
}

/** Which existing record a template record replaces (same type+name and same "kind" prefix). */
export function replacesRecord(existing: DnsRecord, next: DnsRecord) {
  if (existing.type !== next.type || existing.name.toLowerCase() !== next.name.toLowerCase()) return false;
  if (next.type !== "TXT") return next.type === "CNAME";
  const kind = (s: string) => s.replace(/^"|"$/g, "").split(/[\s;]/)[0]!.toLowerCase();
  return kind(existing.content) === kind(next.content);
}
