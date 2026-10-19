import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LOGIN_DRIVERS, PLATFORMS, SPONSOR_TEMPLATES } from "@/lib/sponsor-platforms";

export type SponsorValues = {
  id?: string; name: string; platform: string; login_driver: string; affiliate_id: string; api_url: string; report_url: string;
  login_url: string; home_url: string; tracking_template: string; username?: string; password?: string; api_key?: string;
};
type Initial = Partial<SponsorValues> & { has_password?: boolean; has_api_key?: boolean };

export function SponsorForm({ initial, onSubmit, onCancel }: { initial?: Initial; onSubmit: (v: SponsorValues) => Promise<void>; onCancel?: () => void }) {
  const [v, setV] = useState<SponsorValues>({
    id: initial?.id, name: initial?.name ?? "", platform: initial?.platform ?? "everflow", login_driver: initial?.login_driver ?? "everflow",
    affiliate_id: initial?.affiliate_id ?? "", api_url: initial?.api_url ?? "", report_url: initial?.report_url ?? "", login_url: initial?.login_url ?? "",
    home_url: initial?.home_url ?? "", tracking_template: initial?.tracking_template ?? "", username: "", password: "", api_key: "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof SponsorValues) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  const p = PLATFORMS[v.platform]!;

  function applyTemplate(name: string) {
    const t = SPONSOR_TEMPLATES.find((x) => x.name === name);
    if (!t) return;
    const pl = PLATFORMS[t.platform]!;
    setV({ ...v, name: t.name, platform: t.platform, login_driver: pl.loginDriver, api_url: t.api_url ?? v.api_url, tracking_template: pl.trackingFormat });
  }

  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await onSubmit(v); } finally { setBusy(false); } }}>
      {!initial?.id && (
        <div className="md:col-span-2">
          <Label>Start from a template</Label>
          <Select onValueChange={applyTemplate}><SelectTrigger><SelectValue placeholder="Choose a preconfigured sponsor…" /></SelectTrigger>
            <SelectContent>{SPONSOR_TEMPLATES.map((t) => <SelectItem key={t.name} value={t.name}>{t.name} — {PLATFORMS[t.platform]?.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      <div><Label>Name</Label><Input required value={v.name} onChange={set("name")} /></div>
      <div><Label>Platform</Label>
        <Select value={v.platform} onValueChange={(x) => setV({ ...v, platform: x, login_driver: PLATFORMS[x]!.loginDriver, tracking_template: PLATFORMS[x]!.trackingFormat })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{Object.values(PLATFORMS).map((x) => <SelectItem key={x.id} value={x.id}>{x.label}</SelectItem>)}</SelectContent>
        </Select>
        <p className="mt-1 text-xs text-muted-foreground">{p.apiHint}</p>
      </div>
      <div><Label>API URL</Label><Input value={v.api_url} onChange={set("api_url")} placeholder="https://…" /></div>
      <div><Label>Affiliate ID</Label><Input value={v.affiliate_id} onChange={set("affiliate_id")} /></div>
      <div><Label>API key {initial?.has_api_key && <span className="text-xs text-muted-foreground">(saved — leave empty to keep)</span>}</Label><Input type="password" autoComplete="off" value={v.api_key} onChange={set("api_key")} /></div>
      <div><Label>Auto-login driver</Label>
        <Select value={v.login_driver} onValueChange={(x) => setV({ ...v, login_driver: x })}><SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(LOGIN_DRIVERS).map(([k, d]) => <SelectItem key={k} value={k}>{d.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div><Label>Login page URL</Label><Input value={v.login_url} onChange={set("login_url")} placeholder="https://…/login" /></div>
      <div><Label>Home page URL</Label><Input value={v.home_url} onChange={set("home_url")} placeholder="https://…" /></div>
      <div><Label>Username</Label><Input autoComplete="off" value={v.username} onChange={set("username")} placeholder={initial?.id ? "leave empty to keep" : ""} /></div>
      <div><Label>Password {initial?.has_password && <span className="text-xs text-muted-foreground">(saved — leave empty to keep)</span>}</Label><Input type="password" autoComplete="new-password" value={v.password} onChange={set("password")} /></div>
      <div className="md:col-span-2"><Label>Tracking template</Label><Input className="font-mono text-xs" value={v.tracking_template} onChange={set("tracking_template")} placeholder={p.trackingFormat} /></div>
      <div className="flex gap-2 md:col-span-2">
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}
