import { createFileRoute } from "@tanstack/react-router";

// Returns the KumoMTA policy for the calling server (includes SES relay credentials when linked).
export const Route = createFileRoute("/api/public/agent/config")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { agentFromRequest, json } = await import("@/lib/agent.server");
        const a = await agentFromRequest(request);
        if (!a) return json({ error: "unauthorized" }, 401);
        const { buildInitLua, parseConfig } = await import("@/lib/kumo-config");
        const origin = new URL(request.url).origin;
        let relay = null;
        if (a.server.ses_account_id) {
          const { data: acc } = await a.db.from("provider_accounts").select("credentials_encrypted").eq("id", a.server.ses_account_id).maybeSingle();
          if (acc) {
            const { decryptCreds } = await import("@/lib/providers.server");
            const { sesSmtpPassword } = await import("@/lib/ses.server");
            const c = await decryptCreds(acc.credentials_encrypted);
            const region = c["region"] || "us-east-1";
            relay = { host: `email-smtp.${region}.amazonaws.com`, username: c["access_key_id"]!, password: await sesSmtpPassword(c["secret_access_key"]!, region) };
          }
        }
        const hostname = (a.server.hostname || (a.server.system as Record<string, string>)?.["hostname"] || a.server.ip) as string;
        return json({ init_lua: buildInitLua({ hostname, eventsUrl: `${origin}/api/public/agent/events?t=${a.token}`, cfg: parseConfig(a.server.config), relay }) });
      },
    },
  },
});
