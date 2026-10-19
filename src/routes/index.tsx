import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Activity, BarChart3, Mail, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cortex — Email campaigns, lists & deliverability" },
      { name: "description", content: "Cortex is the operations console for email marketing teams: campaigns, lists, deliverability and stats." },
      { property: "og:title", content: "Cortex — Email campaigns, lists & deliverability" },
      { property: "og:description", content: "The operations console for email marketing teams." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const features = [
    { icon: Mail, title: "Campaigns", text: "Build, schedule, pause and track every send." },
    { icon: BarChart3, title: "Live stats", text: "Opens, clicks, bounces, revenue — at a glance." },
    { icon: ShieldCheck, title: "Roles & audit", text: "Granular permissions and a full activity trail." },
    { icon: Activity, title: "Deliverability", text: "Domains, servers and reputation in one place." },
  ];
  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2 font-display text-lg font-semibold">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-brand text-primary-foreground">C</span>
          Cortex
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>
      <main className="mx-auto max-w-6xl px-6 pb-24 pt-16">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Email operations console</p>
        <h1 className="mt-4 max-w-3xl text-5xl font-semibold leading-[1.05] md:text-7xl">
          Every send, every list, every signal.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          Cortex brings campaigns, subscribers and deliverability into a single dense, fast workspace.
        </p>
        <div className="mt-10 flex gap-3">
          <Button asChild size="lg">
            <Link to="/auth">Open console</Link>
          </Button>
        </div>
        <div className="mt-24 grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="bg-card p-6">
              <f.icon className="h-5 w-5 text-primary" />
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
