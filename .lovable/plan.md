# Cortex — Email Marketing Operations SaaS

The brief covers 15+ large modules (campaigns, A/B tests, lists, segments, offers, domains, servers, PowerMTA, stats...). Building all of it at once would be fragile, so it is delivered in phases. Each phase is fully working with saved data — no static mockups.

## Phase 1 (this build): Foundation + core modules
1. **Login & accounts** — sign in, sign out, password reset page, persistent session, profile page (name, timezone, password change).
2. **Roles** — Super Admin, Admin, Manager, Operator, Analyst, Viewer, with per-module permissions (view/create/edit/delete/export/execute/settings). First user becomes Super Admin.
3. **App shell** — collapsible sidebar with all modules listed (future ones marked "Coming soon"), top bar with notifications counter, light/dark toggle, fully responsive. English UI, text organized for later French translation.
4. **Dashboard** — KPI cards (campaigns, sent, delivered, opens, clicks, bounces, unsubscribes, rates, revenue/cost/profit, lists, subscribers, domains, server health), charts with period selector (today/7d/30d/90d/year/custom), widgets for recent & scheduled campaigns, recent activity.
5. **Campaigns** — table with search, filters, sorting, pagination; create/edit form (all fields from the brief), duplicate, archive, delete with confirmation, status actions (schedule, start, pause, resume, stop, cancel), HTML editor with live desktop/mobile preview, unsubscribe-link and variable checks, execution log. Sending runs in clearly labelled **demo mode** until a real sending server is connected.
6. **Email Lists & Subscribers** — list CRUD, CSV/TXT import with progress, duplicate and address validation, export, subscriber table with all fields, bulk actions (tag, move, copy, unsubscribe, block, delete).
7. **Activity log** — records sensitive actions.
8. Demo data seeded so the dashboard isn't empty.

## Later phases (proposed order)
- Phase 2: Segments (AND/OR rule builder), tags/categories/verticals/geos, A/B tests.
- Phase 3: Networks, offers, creatives, suppression lists.
- Phase 4: Domains & DNS checks (real DNS lookups), delivery servers, pools, warm-up.
- Phase 5: PowerMTA, SSH command whitelist, IMAP/Gmail/Microsoft integrations (need your servers/keys), 2FA (TOTP), IP restriction, advanced statistics.

## Technical details
- Lovable Cloud for auth, Postgres, storage; RLS on every table, roles in a separate `user_roles` table with a `has_role` security-definer function plus a `role_permissions` matrix.
- Server logic via TanStack Start server functions (the project's stack; replaces Edge Functions in the brief). External adapters (SMTP/SSH/PowerMTA) behind an interface with a demo implementation.
- TanStack Query, Recharts, React Hook Form + Zod, shadcn/ui, sonner toasts.
- Distinct visual direction: dense ops-console look, graphite neutrals with a single electric-teal accent, Space Grotesk headings / IBM Plex Sans body.
- XLSX import added in Phase 2 (needs a parsing library); CSV/TXT in Phase 1.
