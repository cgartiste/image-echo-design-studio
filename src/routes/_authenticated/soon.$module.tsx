import { createFileRoute } from "@tanstack/react-router";
import { Panel } from "@/components/page";

const DESC: Record<string, string> = {
  segments: "Rule builder with AND/OR groups across country, engagement, tags and history.",
  "ab-tests": "Split tests on subjects, senders, content, offers and send times.",
  taxonomy: "Categories, verticals, geographies and custom tags.",
  offers: "Sponsors, networks, offers and creatives.",
  suppression: "Global and per-offer suppression lists with background processing.",
  domains: "Domain inventory with SPF, DKIM, DMARC and MX checks.",
  servers: "Delivery servers, pools, IPs, warm-up and SSH health checks.",
  powermta: "PowerMTA configuration editor, validation and version history.",
};

export const Route = createFileRoute("/_authenticated/soon/$module")({
  head: () => ({ meta: [{ title: "Coming soon — Cortex" }, { name: "description", content: "Upcoming Cortex module." }] }),
  component: Soon,
});

function Soon() {
  const { module } = Route.useParams();
  return (
    <Panel className="mx-auto mt-10 max-w-lg p-8 text-center">
      <p className="font-mono text-xs uppercase tracking-widest text-primary">Coming in a later phase</p>
      <h1 className="mt-3 text-2xl font-semibold capitalize">{module.replace("-", " ")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{DESC[module] ?? "This module is on the roadmap."}</p>
    </Panel>
  );
}
