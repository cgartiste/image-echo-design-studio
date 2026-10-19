// Server-only: credential encryption + DNS / rDNS provider adapters.
import type { DnsRecord } from "./dns-records";

export type ProviderId = "cloudflare" | "godaddy" | "sav" | "hetzner" | "ovh" | "digitalocean" | "vultr" | "linode";
export type Creds = Record<string, string>;
export type Zone = { name: string; ref: string; nameservers: string[] };

export const DNS_PROVIDERS: ProviderId[] = ["cloudflare", "godaddy", "sav"];
export const RDNS_PROVIDERS: ProviderId[] = ["hetzner", "ovh", "digitalocean", "vultr", "linode"];

// ---------- crypto ----------
async function aesKey() {
  const secret = process.env["DNS_CREDENTIALS_KEY"];
  if (!secret) throw new Error("Encryption key missing");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function encryptCreds(c: Creds) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(), new TextEncoder().encode(JSON.stringify(c))));
  return `${b64(iv)}.${b64(ct)}`;
}
export async function decryptCreds(s: string): Promise<Creds> {
  const [iv, ct] = s.split(".");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv!) }, await aesKey(), unb64(ct!));
  return JSON.parse(new TextDecoder().decode(pt));
}

// ---------- http ----------
async function call(url: string, init: RequestInit & { label: string }) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body: unknown = text;
  try { body = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  if (!res.ok) throw new Error(`${init.label} ${res.status}: ${text.slice(0, 300)}`);
  return body as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}
const rel = (fqdn: string, zone: string) => (fqdn === zone ? "@" : fqdn.endsWith("." + zone) ? fqdn.slice(0, -zone.length - 1) : fqdn);
const abs = (name: string, zone: string) => (name === "@" ? zone : `${name}.${zone}`);

// ---------- DNS providers ----------
export interface DnsAdapter {
  test(): Promise<string>;
  listZones(): Promise<Zone[]>;
  listRecords(zone: Zone): Promise<DnsRecord[]>;
  upsert(zone: Zone, rec: DnsRecord, replace?: DnsRecord): Promise<void>;
  remove(zone: Zone, rec: DnsRecord): Promise<void>;
  setNameservers?(zone: Zone, ns: string[]): Promise<void>;
}

function cloudflare(c: Creds): DnsAdapter {
  const base = "https://api.cloudflare.com/client/v4";
  const token = (c["api_token"] ?? "").trim();
  const email = (c["email"] ?? "").trim();
  // Global API Key (with account email) uses X-Auth headers; scoped API tokens use Bearer.
  const h: Record<string, string> = email
    ? { "X-Auth-Email": email, "X-Auth-Key": token, "Content-Type": "application/json" }
    : { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const cf = async (path: string, init: RequestInit = {}) => {
    let r;
    try { r = await call(base + path, { ...init, headers: h, label: "Cloudflare" }); }
    catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (/\b(9109|6003|6111|10000)\b/.test(m)) throw new Error(email
        ? "Cloudflare refused the Global API Key: check the account email and key."
        : "Cloudflare refused this token. Create an API Token (My Profile → API Tokens) with Zone:Read and DNS:Edit on your zones, or enter your account email to use the Global API Key.");
      throw e;
    }
    if (!r.success) throw new Error(`Cloudflare: ${r.errors?.[0]?.message ?? "error"}`);
    return r;
  };
  return {
    async test() { await cf("/zones?per_page=1"); return "Token valid"; },
    async listZones() {
      const out: Zone[] = [];
      for (let page = 1; ; page++) {
        const r = await cf(`/zones?per_page=50&page=${page}`);
        for (const z of r.result) out.push({ name: z.name, ref: z.id, nameservers: z.name_servers ?? [] });
        if (page >= (r.result_info?.total_pages ?? 1)) break;
      }
      return out;
    },
    async listRecords(z) {
      const out: DnsRecord[] = [];
      for (let page = 1; ; page++) {
        const r = await cf(`/zones/${z.ref}/dns_records?per_page=500&page=${page}`);
        for (const x of r.result) out.push({ id: x.id, type: x.type, name: x.name, content: x.content, ttl: x.ttl, ...(x.priority != null ? { priority: x.priority } : {}) });
        if (page >= (r.result_info?.total_pages ?? 1)) break;
      }
      return out;
    },
    async upsert(z, rec, replace) {
      const body = JSON.stringify({ type: rec.type, name: rec.name, content: rec.content, ttl: rec.ttl, ...(rec.priority != null ? { priority: rec.priority } : {}) });
      const id = replace?.id ?? rec.id;
      if (id) await cf(`/zones/${z.ref}/dns_records/${id}`, { method: "PUT", body });
      else await cf(`/zones/${z.ref}/dns_records`, { method: "POST", body });
    },
    async remove(z, rec) { await cf(`/zones/${z.ref}/dns_records/${rec.id}`, { method: "DELETE" }); },
  };
}

function godaddy(c: Creds): DnsAdapter {
  const base = "https://api.godaddy.com/v1";
  const h = { Authorization: `sso-key ${c["api_key"]}:${c["api_secret"]}`, "Content-Type": "application/json", Accept: "application/json" };
  const gd = (path: string, init: RequestInit = {}) => call(base + path, { ...init, headers: h, label: "GoDaddy" });
  const idOf = (r: { type: string; name: string; data: string }) => `${r.type}|${r.name}|${r.data}`;
  async function setRRset(domain: string, type: string, name: string, items: { data: string; ttl: number; priority?: number }[]) {
    if (items.length === 0) await gd(`/domains/${domain}/records/${type}/${encodeURIComponent(name)}`, { method: "DELETE" });
    else await gd(`/domains/${domain}/records/${type}/${encodeURIComponent(name)}`, { method: "PUT", body: JSON.stringify(items) });
  }
  async function rrset(domain: string, type: string, name: string) {
    const r: { data: string; ttl: number; priority?: number }[] = await gd(`/domains/${domain}/records/${type}/${encodeURIComponent(name)}`);
    return r.map((x) => ({ data: x.data, ttl: x.ttl, ...(x.priority != null ? { priority: x.priority } : {}) }));
  }
  return {
    async test() { await gd("/domains?limit=1"); return "Key valid"; },
    async listZones() {
      const out: Zone[] = [];
      let marker = "";
      for (;;) {
        const r: { domain: string; nameServers?: string[] }[] = await gd(`/domains?statuses=ACTIVE&limit=1000${marker ? `&marker=${marker}` : ""}`);
        for (const d of r) out.push({ name: d.domain, ref: d.domain, nameservers: d.nameServers ?? [] });
        if (r.length < 1000) break;
        marker = r[r.length - 1]!.domain;
      }
      return out;
    },
    async listRecords(z) {
      const r: { type: string; name: string; data: string; ttl: number; priority?: number }[] = await gd(`/domains/${z.name}/records`);
      return r.map((x) => ({ id: idOf(x), type: x.type, name: abs(x.name, z.name), content: x.data, ttl: x.ttl, ...(x.priority != null ? { priority: x.priority } : {}) }));
    },
    async upsert(z, rec, replace) {
      const name = rel(rec.name, z.name);
      // GoDaddy replaces a whole type+name set: keep the other values in it.
      const current = await rrset(z.name, rec.type, name);
      const old = replace ?? (rec.id ? { content: rec.id.split("|").slice(2).join("|") } : null);
      const kept = current.filter((x) => !old || x.data !== old.content);
      await setRRset(z.name, rec.type, name, [...kept, { data: rec.content, ttl: Math.max(600, rec.ttl), ...(rec.priority != null ? { priority: rec.priority } : {}) }]);
    },
    async remove(z, rec) {
      const name = rel(rec.name, z.name);
      const current = await rrset(z.name, rec.type, name);
      await setRRset(z.name, rec.type, name, current.filter((x) => x.data !== rec.content));
    },
    async setNameservers(z, ns) {
      await gd(`/domains/${z.name}`, { method: "PATCH", body: JSON.stringify({ nameServers: ns }) });
    },
  };
}

function sav(c: Creds): DnsAdapter {
  const base = "https://api.sav.com/domains_api_v1";
  const sv = async (path: string) => {
    const r = await call(base + path, { headers: { APIKEY: c["api_key"]! }, label: "Sav" });
    if (r && typeof r === "object" && (r.status === "error" || r.success === false)) throw new Error(`Sav: ${r.message ?? r.error ?? "error"}`);
    return r;
  };
  const noRecords = () => { throw new Error("Sav's API does not support editing DNS records. Point this domain's nameservers to Cloudflare, then manage records there."); };
  return {
    async test() { await sv("/get_active_domains_in_account"); return "Key valid"; },
    async listZones() {
      const r = await sv("/get_active_domains_in_account");
      const arr: unknown[] = Array.isArray(r) ? r : r?.domains ?? r?.data ?? r?.result ?? [];
      return arr
        .map((d) => (typeof d === "string" ? d : (d as Record<string, string>)["domain_name"] ?? (d as Record<string, string>)["domain"] ?? ""))
        .filter(Boolean)
        .map((name) => ({ name: name.toLowerCase(), ref: name.toLowerCase(), nameservers: [] }));
    },
    async listRecords() { return []; },
    async upsert() { noRecords(); },
    async remove() { noRecords(); },
    async setNameservers(z, ns) {
      const q = ns.slice(0, 4).map((n, i) => `&ns_${i + 1}=${encodeURIComponent(n)}`).join("");
      await sv(`/update_domain_nameservers?domain_name=${encodeURIComponent(z.name)}${q}`);
    },
  };
}

export function dnsAdapter(p: ProviderId, c: Creds): DnsAdapter {
  if (p === "cloudflare") return cloudflare(c);
  if (p === "godaddy") return godaddy(c);
  if (p === "sav") return sav(c);
  throw new Error(`${p} is not a DNS provider`);
}

// ---------- rDNS providers ----------
export interface RdnsAdapter {
  test(): Promise<string>;
  setPtr(ip: string, hostname: string): Promise<string>;
}

function hetzner(c: Creds): RdnsAdapter {
  const base = "https://api.hetzner.cloud/v1";
  const h = { Authorization: `Bearer ${c["api_token"]}`, "Content-Type": "application/json" };
  const hz = (p: string, init: RequestInit = {}) => call(base + p, { ...init, headers: h, label: "Hetzner" });
  return {
    async test() { await hz("/servers?per_page=1"); return "Token valid"; },
    async setPtr(ip, hostname) {
      for (let page = 1; page < 50; page++) {
        const r = await hz(`/servers?per_page=50&page=${page}`);
        const s = r.servers.find((x: any) => x.public_net?.ipv4?.ip === ip || (x.public_net?.floating_ips ?? []).includes(ip)); // eslint-disable-line @typescript-eslint/no-explicit-any
        if (s) { await hz(`/servers/${s.id}/actions/change_dns_ptr`, { method: "POST", body: JSON.stringify({ ip, dns_ptr: hostname }) }); return `server ${s.name}`; }
        if (!r.meta?.pagination?.next_page) break;
      }
      const p = await hz(`/primary_ips?ip=${encodeURIComponent(ip)}`);
      const pip = p.primary_ips?.[0];
      if (pip) { await hz(`/primary_ips/${pip.id}/actions/change_dns_ptr`, { method: "POST", body: JSON.stringify({ ip, dns_ptr: hostname }) }); return "primary IP"; }
      throw new Error("IP not found in this Hetzner Cloud project");
    },
  };
}

function digitalocean(c: Creds): RdnsAdapter {
  const base = "https://api.digitalocean.com/v2";
  const h = { Authorization: `Bearer ${c["api_token"]}`, "Content-Type": "application/json" };
  const d = (p: string, init: RequestInit = {}) => call(base + p, { ...init, headers: h, label: "DigitalOcean" });
  return {
    async test() { await d("/account"); return "Token valid"; },
    async setPtr(ip, hostname) {
      for (let page = 1; page < 50; page++) {
        const r = await d(`/droplets?per_page=200&page=${page}`);
        const s = r.droplets.find((x: any) => x.networks?.v4?.some((n: any) => n.ip_address === ip)); // eslint-disable-line @typescript-eslint/no-explicit-any
        // DigitalOcean derives the PTR from the droplet name.
        if (s) { await d(`/droplets/${s.id}/actions`, { method: "POST", body: JSON.stringify({ type: "rename", name: hostname }) }); return `droplet renamed to ${hostname}`; }
        if (!r.links?.pages?.next) break;
      }
      throw new Error("IP not found in this DigitalOcean account");
    },
  };
}

function vultr(c: Creds): RdnsAdapter {
  const base = "https://api.vultr.com/v2";
  const h = { Authorization: `Bearer ${c["api_token"]}`, "Content-Type": "application/json" };
  const v = (p: string, init: RequestInit = {}) => call(base + p, { ...init, headers: h, label: "Vultr" });
  return {
    async test() { await v("/account"); return "Key valid"; },
    async setPtr(ip, hostname) {
      let cursor = "";
      for (let i = 0; i < 50; i++) {
        const r = await v(`/instances?per_page=500${cursor ? `&cursor=${cursor}` : ""}`);
        const s = r.instances.find((x: any) => x.main_ip === ip); // eslint-disable-line @typescript-eslint/no-explicit-any
        if (s) { await v(`/instances/${s.id}/ipv4/reverse`, { method: "POST", body: JSON.stringify({ ip, reverse: hostname }) }); return `instance ${s.label}`; }
        cursor = r.meta?.links?.next ?? "";
        if (!cursor) break;
      }
      throw new Error("IP not found in this Vultr account");
    },
  };
}

function linode(c: Creds): RdnsAdapter {
  const base = "https://api.linode.com/v4";
  const h = { Authorization: `Bearer ${c["api_token"]}`, "Content-Type": "application/json" };
  const l = (p: string, init: RequestInit = {}) => call(base + p, { ...init, headers: h, label: "Linode" });
  return {
    async test() { await l("/profile"); return "Token valid"; },
    async setPtr(ip, hostname) { await l(`/networking/ips/${ip}`, { method: "PUT", body: JSON.stringify({ rdns: hostname }) }); return "updated"; },
  };
}

function ovh(c: Creds): RdnsAdapter {
  const endpoints: Record<string, string> = { eu: "https://eu.api.ovh.com/1.0", ca: "https://ca.api.ovh.com/1.0", us: "https://api.us.ovhcloud.com/1.0" };
  const base = endpoints[c["region"] ?? "eu"] ?? endpoints["eu"]!;
  async function signed(method: string, path: string, body?: unknown) {
    const url = base + path;
    const ts = String(await call(`${base}/auth/time`, { label: "OVH" }));
    const payload = body ? JSON.stringify(body) : "";
    const raw = [c["app_secret"], c["consumer_key"], method, url, payload, ts].join("+");
    const sha = new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(raw)));
    const sig = "$1$" + [...sha].map((b) => b.toString(16).padStart(2, "0")).join("");
    return call(url, {
      method, label: "OVH",
      headers: { "X-Ovh-Application": c["app_key"]!, "X-Ovh-Consumer": c["consumer_key"]!, "X-Ovh-Timestamp": ts, "X-Ovh-Signature": sig, "Content-Type": "application/json" },
      ...(payload ? { body: payload } : {}),
    });
  }
  return {
    async test() { await signed("GET", "/me"); return "Credentials valid"; },
    async setPtr(ip, hostname) {
      const blocks: string[] = await signed("GET", `/ip?ip=${encodeURIComponent(ip)}`);
      const block = blocks[0];
      if (!block) throw new Error("IP not found in this OVH account");
      await signed("POST", `/ip/${encodeURIComponent(block)}/reverse`, { ipReverse: ip, reverse: hostname.endsWith(".") ? hostname : hostname + "." });
      return `block ${block}`;
    },
  };
}

export function rdnsAdapter(p: ProviderId, c: Creds): RdnsAdapter {
  switch (p) {
    case "hetzner": return hetzner(c);
    case "digitalocean": return digitalocean(c);
    case "vultr": return vultr(c);
    case "linode": return linode(c);
    case "ovh": return ovh(c);
    default: throw new Error(`${p} does not manage reverse DNS`);
  }
}

// ---------- public DNS lookups (DNS over HTTPS) ----------
export async function lookup(name: string, type: string): Promise<string[]> {
  const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, { headers: { Accept: "application/dns-json" } });
  if (!r.ok) return [];
  const j = (await r.json()) as { Answer?: { type: number; data: string }[] };
  return (j.Answer ?? []).map((a) => a.data.replace(/^"|"$/g, "").replace(/"\s*"/g, ""));
}
