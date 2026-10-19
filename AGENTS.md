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
- External senders (SMTP/SSH/PowerMTA) are not wired yet; campaign actions run in labelled demo mode.
- UI strings go through `src/lib/i18n.ts`; why: French will be added as a second dictionary.
