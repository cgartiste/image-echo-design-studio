import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, Clock, FileText, FlaskConical, Loader2, Pause, Play, ShieldCheck, Square, Archive, XCircle, AlertTriangle } from "lucide-react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const statusStyles: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-info/15 text-info",
  running: "bg-primary/15 text-primary",
  paused: "bg-warning/20 text-warning-foreground dark:text-warning",
  completed: "bg-success/15 text-success",
  failed: "bg-destructive/15 text-destructive",
  cancelled: "bg-destructive/10 text-destructive",
  archived: "bg-muted text-muted-foreground",
  ready: "bg-success/15 text-success",
  publishing: "bg-info/15 text-info",
  stopping: "bg-warning/20 text-warning-foreground dark:text-warning",
  stopped: "bg-muted text-muted-foreground",
  test: "bg-info/15 text-info",
  waiting_approval: "bg-warning/20 text-warning-foreground dark:text-warning",
  active: "bg-success/15 text-success",
  inactive: "bg-muted text-muted-foreground",
  unsubscribed: "bg-warning/20 text-warning-foreground dark:text-warning",
  blocked: "bg-destructive/15 text-destructive",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const icons: Record<string, typeof Clock> = { draft:FileText,ready:ShieldCheck,scheduled:Clock,publishing:Loader2,running:Play,paused:Pause,stopping:Loader2,stopped:Square,completed:CheckCircle2,failed:AlertTriangle,cancelled:XCircle,archived:Archive,test:FlaskConical,waiting_approval:Clock };
  const Icon = icons[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium capitalize",
        statusStyles[status] ?? "bg-muted text-muted-foreground",
        className,
      )}
    >
      {Icon && <Icon className="h-3 w-3" />}
      {status.replaceAll("_", " ")}
    </span>
  );
}

export function Panel({ title, children, className, action }: { title?: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={cn("rounded-lg border bg-card shadow-card", className)}>
      {title && (
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function DemoBadge() {
  return (
    <span className="rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-warning-foreground dark:text-warning">
      Demo mode
    </span>
  );
}
