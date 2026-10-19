// Client-safe description of every provider and the credential fields it needs.
export type ProviderKind = "dns" | "rdns";
export const PROVIDERS: Record<string, { label: string; kind: ProviderKind; fields: { id: string; label: string; secret?: boolean; placeholder?: string }[]; note?: string }> = {
  cloudflare: { label: "Cloudflare", kind: "dns", fields: [{ id: "api_token", label: "API token", secret: true, placeholder: "Zone:Read + DNS:Edit" }] },
  godaddy: { label: "GoDaddy", kind: "dns", fields: [{ id: "api_key", label: "API key" }, { id: "api_secret", label: "API secret", secret: true }], note: "Production key from developer.godaddy.com." },
  sav: { label: "Sav.com", kind: "dns", fields: [{ id: "api_key", label: "API key", secret: true }], note: "Sav's API can import domains and change nameservers, but not edit DNS records." },
  hetzner: { label: "Hetzner Cloud", kind: "rdns", fields: [{ id: "api_token", label: "Project API token", secret: true }] },
  ovh: {
    label: "OVHcloud", kind: "rdns",
    fields: [{ id: "region", label: "Region (eu / ca / us)", placeholder: "eu" }, { id: "app_key", label: "Application key" }, { id: "app_secret", label: "Application secret", secret: true }, { id: "consumer_key", label: "Consumer key", secret: true }],
    note: "Create keys at eu.api.ovh.com/createToken with GET/POST on /ip/*.",
  },
  digitalocean: { label: "DigitalOcean", kind: "rdns", fields: [{ id: "api_token", label: "API token", secret: true }], note: "rDNS follows the droplet name; setting it renames the droplet." },
  vultr: { label: "Vultr", kind: "rdns", fields: [{ id: "api_token", label: "API key", secret: true }] },
  linode: { label: "Linode / Akamai", kind: "rdns", fields: [{ id: "api_token", label: "Personal access token", secret: true }] },
};
