# Advanced campaigns
- [x] Lifecycle, audit, permissions, immutable running/completed content and safe cloning.
- [x] Three-zone builder, recipient exclusions/counts, imported offers, saved configs, preview and publication checklist.
- [x] Campaign table filters/export, aggregate metrics, logs, conversions and explicit disconnected operational views.
- [x] Tests and signed-in creation/save/readback/clone/config verification; publication blocked; mobile overflow checked; QA drafts removed.
- [ ] Real sending, tests, queue execution, event ingestion and public tracking/webview: blocked by missing authorized sending service and external worker.
# Cortex brief — Phase 1
- [x] Invitation-only access, team page (invite, role, department, suspend), first-admin bootstrap.
- [x] VIP clients + 10-account Amazon SES VIP pool with DB guards and audited assignments.
- [x] Global suppression list enforced in every send queue.
- [x] Permission matrix restored in the remixed database.
- [ ] Amazon SES event intake (bounces/complaints via SNS): needs a published URL and SNS signature verification.
- [ ] 2FA enforcement, SSO, IP allow-list, session history: not started.
- [ ] Phases 2–6 of the brief.
