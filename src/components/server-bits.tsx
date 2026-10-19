import { CheckCircle2, XCircle } from "lucide-react";
import { isOnline } from "@/lib/kumo-config";

export function PortBadge({ ok, label }: { ok: boolean | undefined; label: string }) {
  if (ok === undefined) return <span className="text-xs text-muted-foreground">{label} ?</span>;
  return <span className={`inline-flex items-center gap-1 text-xs ${ok ? "text-success" : "text-destructive"}`}>{ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}{label}</span>;
}
export function serverState(s: { last_seen_at: string | null; kumo_installed: boolean; kumo_active: boolean; paused: boolean }) {
  if (!isOnline(s.last_seen_at)) return s.last_seen_at ? { label: "Agent offline", tone: "destructive" as const } : { label: "Waiting for agent", tone: "secondary" as const };
  if (s.paused) return { label: "Paused", tone: "secondary" as const };
  if (!s.kumo_installed) return { label: "KumoMTA not installed", tone: "outline" as const };
  return s.kumo_active ? { label: "Online", tone: "default" as const } : { label: "KumoMTA stopped", tone: "destructive" as const };
}

