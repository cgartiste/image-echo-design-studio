// Server-only sponsor API adapters. Each adapter normalises offers/conversions/suppression.
export type SponsorCreds = { username?: string; password?: string; api_key?: string };
export type SponsorRow = { id: string; platform: string; api_driver: string; api_url: string | null; report_url: string | null; affiliate_id: string | null };
export type NormOffer = { external_id: string; name: string; status: string; payout: number; payout_type?: string; currency?: string; vertical?: string; countries: string[]; preview_url?: string; tracking_url?: string; image_url?: string; description?: string };
export type NormConversion = { external_id: string; offer_external_id?: string; offer_name?: string; payout: number; sub1?: string; sub2?: string; sub3?: string; converted_at: string };

export interface ApiAdapter {
  testCredentials(): Promise<string>;
  getOffers(): Promise<NormOffer[]>;
  getConversions(from: string, to: string): Promise<NormConversion[]>;
  getSuppressionLink(offerExternalId: string): Promise<string | null>;
}

async function j(url: string, init?: RequestInit) {
  const r = await fetch(url, { ...init, headers: { Accept: "application/json", ...(init?.headers ?? {}) } });
  const text = await r.text();
  if (!r.ok) throw new Error(`Provider responded ${r.status}: ${text.slice(0, 160)}`);
  try { return JSON.parse(text); } catch { throw new Error("Provider returned non-JSON response"); }
}
const s = (v: unknown) => (v == null ? undefined : String(v));
const n = (v: unknown) => Number(v) || 0;
const base = (u: string | null, d?: string) => { const v = (u || d || "").replace(/\/+$/, ""); if (!v) throw new Error("API URL is missing"); return v; };
const need = (k?: string, label = "API key") => { if (!k) throw new Error(`${label} is missing`); return k; };

function everflow(sp: SponsorRow, c: SponsorCreds): ApiAdapter {
  const b = base(sp.api_url, "https://api.eflow.team");
  const h = () => ({ "X-Eflow-API-Key": need(c.api_key), "Content-Type": "application/json" });
  return {
    async testCredentials() { await j(`${b}/v1/affiliates/affiliate`, { headers: h() }); return "Everflow API key accepted"; },
    async getOffers() {
      const d = await j(`${b}/v1/affiliates/offersrunnable`, { headers: h() });
      return (d.offers ?? []).map((o: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
        external_id: String(o.network_offer_id), name: o.name, status: o.offer_status ?? "active",
        payout: n(o.relationship?.payouts?.entries?.[0]?.payout_amount), payout_type: s(o.relationship?.payouts?.entries?.[0]?.payout_type), currency: o.currency_id,
        vertical: o.relationship?.category?.name, countries: (o.relationship?.ruleset?.countries ?? []).map((x: any) => x.country_code), // eslint-disable-line @typescript-eslint/no-explicit-any
        preview_url: o.preview_url, tracking_url: o.tracking_url, image_url: o.thumbnail_url, description: o.html_description,
      }));
    },
    async getConversions(from, to) {
      const d = await j(`${b}/v1/affiliates/reporting/conversions`, { method: "POST", headers: h(), body: JSON.stringify({ from, to, timezone_id: 67, show_conversions: true }) });
      return (d.conversions ?? []).map((x: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
        external_id: String(x.conversion_id), offer_external_id: s(x.relationship?.offer?.network_offer_id), offer_name: x.relationship?.offer?.name,
        payout: n(x.payout), sub1: x.sub1, sub2: x.sub2, sub3: x.sub3, converted_at: new Date((x.conversion_unix_timestamp ?? 0) * 1000).toISOString(),
      }));
    },
    async getSuppressionLink(id) {
      const d = await j(`${b}/v1/affiliates/offers/${encodeURIComponent(id)}`, { headers: h() });
      return d.relationship?.email_optout?.suppression_file_link ?? d.relationship?.email?.suppression_file_link ?? null;
    },
  };
}

function cake(sp: SponsorRow, c: SponsorCreds): ApiAdapter {
  const b = base(sp.api_url);
  const q = () => `api_key=${encodeURIComponent(need(c.api_key))}&affiliate_id=${encodeURIComponent(need(sp.affiliate_id ?? undefined, "Affiliate ID"))}`;
  return {
    async testCredentials() { await j(`${b}/affiliates/api/Offers/Feed?${q()}&offer_status_id=0&start_at_row=1&row_limit=1`); return "Cake API key accepted"; },
    async getOffers() {
      const d = await j(`${b}/affiliates/api/Offers/Feed?${q()}&offer_status_id=0&start_at_row=1&row_limit=500`);
      return (d.data ?? d.offers ?? []).map((o: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
        external_id: String(o.offer_id ?? o.campaign_id), name: o.offer_name, status: o.offer_status?.status_name?.toLowerCase() ?? "active",
        payout: n(String(o.payout ?? "").replace(/[^0-9.]/g, "")), payout_type: o.price_format, vertical: o.vertical_name,
        countries: (o.allowed_countries ?? []).map((x: any) => x.country_code), preview_url: o.preview_link, // eslint-disable-line @typescript-eslint/no-explicit-any
        tracking_url: o.tracking_link?.split("&s1")[0], image_url: o.thumbnail_image_url, description: o.description,
      }));
    },
    async getConversions(from, to) {
      const d = await j(`${b}/affiliates/api/Reports/Conversions?${q()}&start_date=${from}&end_date=${to}&start_at_row=1&row_limit=5000`);
      return (d.data ?? []).map((x: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
        external_id: String(x.conversion_id), offer_external_id: s(x.offer_id), offer_name: x.offer_name, payout: n(x.price),
        sub1: x.subid_1, sub2: x.subid_2, sub3: x.subid_3, converted_at: new Date(x.conversion_date).toISOString(),
      }));
    },
    async getSuppressionLink(id) {
      const d = await j(`${b}/affiliates/api/Offers/SuppressionList?${q()}&offer_id=${encodeURIComponent(id)}`);
      return d.data?.download_url ?? d.download_url ?? null;
    },
  };
}

function hasoffers(sp: SponsorRow, c: SponsorCreds): ApiAdapter {
  const b = base(sp.api_url);
  const url = (target: string, method: string, extra = "") => `${b}/Apiv3/json?api_key=${encodeURIComponent(need(c.api_key))}&Target=${target}&Method=${method}${extra}`;
  const unwrap = (d: any) => { if (d.response?.status !== 1) throw new Error(d.response?.errorMessage ?? "HasOffers error"); return d.response.data; }; // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    async testCredentials() { unwrap(await j(url("Affiliate_Affiliate", "findById"))); return "HasOffers API key accepted"; },
    async getOffers() {
      const data = unwrap(await j(url("Affiliate_Offer", "findMyApprovedOffers", "&limit=500")));
      return Object.values(data.data ?? data).map((w: any) => { const o = w.Offer ?? w; return { // eslint-disable-line @typescript-eslint/no-explicit-any
        external_id: String(o.id), name: o.name, status: o.status ?? "active", payout: n(o.default_payout), payout_type: o.payout_type, currency: o.currency,
        countries: [], preview_url: o.preview_url, description: o.description,
      }; });
    },
    async getConversions(from, to) {
      const extra = `&fields[]=Stat.id&fields[]=Stat.offer_id&fields[]=Offer.name&fields[]=Stat.payout&fields[]=Stat.affiliate_info1&fields[]=Stat.affiliate_info2&fields[]=Stat.affiliate_info3&fields[]=Stat.datetime&filters[Stat.date][conditional]=BETWEEN&filters[Stat.date][values][]=${from}&filters[Stat.date][values][]=${to}&limit=5000`;
      const data = unwrap(await j(url("Affiliate_Report", "getConversions", extra)));
      return (data.data ?? []).map((r: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
        external_id: String(r.Stat.id), offer_external_id: s(r.Stat.offer_id), offer_name: r.Offer?.name, payout: n(r.Stat.payout),
        sub1: r.Stat.affiliate_info1, sub2: r.Stat.affiliate_info2, sub3: r.Stat.affiliate_info3, converted_at: new Date(r.Stat.datetime).toISOString(),
      }));
    },
    async getSuppressionLink() { return null; },
  };
}

function hitpath(sp: SponsorRow, c: SponsorCreds): ApiAdapter {
  const b = base(sp.api_url);
  const u = (type: string, extra = "") => `${b}${b.includes("?") ? "&" : "?"}key=${encodeURIComponent(need(c.api_key))}&type=${type}&format=json${extra}`;
  return {
    async testCredentials() { await j(u("offers", "&limit=1")); return "HitPath API key accepted"; },
    async getOffers() {
      const d = await j(u("offers"));
      return (d.offers ?? d.data ?? []).map((o: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
        external_id: String(o.id ?? o.campaign_id), name: o.name ?? o.campaign_name, status: "active", payout: n(o.payout), payout_type: o.payout_type,
        countries: String(o.countries ?? "").split(",").filter(Boolean), preview_url: o.preview_url, tracking_url: o.tracking_url, image_url: o.image,
      }));
    },
    async getConversions(from, to) {
      const d = await j(u("conversions", `&start=${from}&end=${to}`));
      return (d.conversions ?? d.data ?? []).map((x: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
        external_id: String(x.id ?? x.transaction_id), offer_external_id: s(x.campaign_id), payout: n(x.payout), sub1: x.c1, sub2: x.c2, sub3: x.c3, converted_at: new Date(x.date ?? Date.now()).toISOString(),
      }));
    },
    async getSuppressionLink(id) { const d = await j(u("suppression", `&campaign_id=${encodeURIComponent(id)}`)); return d.url ?? d.link ?? null; },
  };
}

function affise(sp: SponsorRow, c: SponsorCreds): ApiAdapter {
  const b = base(sp.api_url);
  const h = () => ({ "API-Key": need(c.api_key) });
  return {
    async testCredentials() { await j(`${b}/3.0/partner/me`, { headers: h() }); return "Affise API key accepted"; },
    async getOffers() {
      const d = await j(`${b}/3.0/partner/offers?limit=500`, { headers: h() });
      return (d.offers ?? []).map((o: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
        external_id: String(o.offer_id ?? o.id), name: o.title, status: o.status ?? "active", payout: n(o.payments?.[0]?.revenue), currency: o.payments?.[0]?.currency,
        countries: o.countries ?? [], preview_url: o.preview_url, tracking_url: o.link, image_url: o.logo, description: o.description,
      }));
    },
    async getConversions(from, to) {
      const d = await j(`${b}/3.0/partner/stats/conversions?date_from=${from}&date_to=${to}&limit=5000`, { headers: h() });
      return (d.conversions ?? []).map((x: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
        external_id: String(x.id), offer_external_id: s(x.offer_id), offer_name: x.offer?.title, payout: n(x.payouts), sub1: x.sub1, sub2: x.sub2, sub3: x.sub3, converted_at: new Date(x.created_at).toISOString(),
      }));
    },
    async getSuppressionLink() { return null; },
  };
}

export function apiAdapter(sp: SponsorRow, c: SponsorCreds): ApiAdapter {
  switch (sp.api_driver) {
    case "everflow": return everflow(sp, c);
    case "cake": return cake(sp, c);
    case "hasoffers": return hasoffers(sp, c);
    case "hitpath": return hitpath(sp, c);
    case "affise": return affise(sp, c);
    default: throw new Error("This sponsor has no API driver");
  }
}

export async function sha256(s: string) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return Array.from(h, (b) => b.toString(16).padStart(2, "0")).join("");
}
