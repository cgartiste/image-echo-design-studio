<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Data access uses the browser client with RLS gated by `has_permission(module, action)`; why: role matrix lives in `role_permissions`, so UI and DB share one source of truth.
- Signed-in pages live under `src/routes/_authenticated/`; why: the layout gates auth and renders the app shell.
- Campaign status changes go through `src/lib/campaign-status.ts`; why: one tested transition table.
- Sponsor networks: API adapters in `src/lib/sponsors.server.ts`, platform/login-driver metadata in `src/lib/sponsor-platforms.ts`; credentials only via `src/lib/sponsors.functions.ts`; auto-login uses single-use 2-minute tokens served by `/api/public/sponsor-login/$token`; why: passwords never in URLs, lists or browser state.
- External senders are not connected; publication, test sending and queue operations stay blocked rather than simulated, so the UI cannot imply delivery.
- UI strings go through `src/lib/i18n.ts`; why: French will be added as a second dictionary.
- Provider credentials (DNS + rDNS hosts) live encrypted in `provider_accounts`, readable only by server functions in `src/lib/dns.functions.ts`; why: keys must never reach the browser.
- New DNS/rDNS providers are added as adapters in `src/lib/providers.server.ts` plus field metadata in `src/lib/provider-meta.ts`.
- A DB trigger blocks scheduling/starting campaigns whose sender domain is not verified or that lack an unsubscribe link; why: compliance must hold regardless of UI.
- Campaign settings and validation live in `src/lib/campaign-model.ts`, with guarded commands and recipient/clone RPC wrappers in `src/lib/campaigns.functions.ts`; why: client previews and backend safety share one contract.
- Campaign lifecycle, immutable content, administrator delivery changes and audit entries are enforced by database triggers; why: browser permissions alone are not a security boundary.
- Accounts are invitation-only: `handle_new_user` grants a role only to the first account or invited users; team admin lives in `src/lib/team.functions.ts`; why: Cortex is a private internal tool.
- VIP pool rules (max 10 VIP SES accounts, VIP-only primary, one client per account) are DB triggers; assignments go through `src/lib/vip.functions.ts`; why: guarantees hold regardless of UI.
- The global `suppressions` table is checked inside `enqueue_campaign`; why: no queue path can bypass it.
- Segment rules are evaluated only by SQL `segment_match` (used by `segment_count` and `enqueue_campaign`); SES routing decisions live in `src/lib/routing.ts`; the `system_controls.emergency_stop` flag is checked inside `enqueue_campaign` and `claim_send_jobs`; why: one evaluator per rule, no bypass.
