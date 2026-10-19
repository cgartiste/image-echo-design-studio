import { createFileRoute } from "@tanstack/react-router";
import { LOGIN_DRIVERS } from "@/lib/sponsor-platforms";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const page = (status: number, body: string) =>
  new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Cortex auto-login</title></head><body style="font-family:system-ui;padding:40px;text-align:center">${body}</body></html>`, {
    status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY" },
  });

// One-time auto-login: the token is single-use, expires after 2 minutes and is invalidated on first open.
export const Route = createFileRoute("/api/public/sponsor-login/$token")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        if (!/^[a-f0-9]{64}$/.test(params.token)) return page(400, "<p>Invalid link.</p>");
        const { sha256 } = await import("@/lib/sponsors.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: s } = await supabaseAdmin.from("sponsor_login_sessions").select("id,sponsor_id,expires_at,used_at").eq("token_hash", await sha256(params.token)).maybeSingle();
        if (!s) return page(404, "<p>This login link is not valid.</p>");
        if (s.used_at) return page(410, "<p>This login link was already used. Create a new one from Cortex.</p>");
        const ip = request.headers.get("cf-connecting-ip") ?? null;
        if (new Date(s.expires_at).getTime() < Date.now()) {
          await supabaseAdmin.from("sponsor_login_sessions").update({ result: "expired", used_at: new Date().toISOString(), ip }).eq("id", s.id);
          return page(410, "<p>This login link expired. Create a new one from Cortex.</p>");
        }
        await supabaseAdmin.from("sponsor_login_sessions").update({ used_at: new Date().toISOString(), result: "submitted", ip }).eq("id", s.id).is("used_at", null);
        const { data: sp } = await supabaseAdmin.from("sponsors").select("login_driver,login_url,credentials_encrypted").eq("id", s.sponsor_id).single();
        const driver = sp && LOGIN_DRIVERS[sp.login_driver];
        if (!sp?.login_url || !driver || sp.login_driver === "none" || !sp.credentials_encrypted) return page(400, "<p>Auto-login is not configured.</p>");
        const { decryptCreds } = await import("@/lib/providers.server");
        const c = (await decryptCreds(sp.credentials_encrypted)) as Record<string, string>;
        const fields = driver.fields(c.username ?? "", c.password ?? "");
        const action = sp.login_url + (driver.urlSuffix && !sp.login_url.includes("?") ? driver.urlSuffix : "");
        const inputs = Object.entries(fields).map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join("");
        return page(200, `<p>Signing you in…</p><form id="f" method="post" action="${esc(action)}">${inputs}<noscript><button>Continue</button></noscript></form><script>document.getElementById("f").submit()</script>`);
      },
    },
  },
});
