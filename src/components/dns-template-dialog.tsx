import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { applyTemplate, generateDkimKey } from "@/lib/dns.functions";
import { download } from "@/lib/csv";

type Props = { open: boolean; onOpenChange: (o: boolean) => void; domainIds: string[]; onDone?: () => void };

export function TemplateDialog({ open, onOpenChange, domainIds, onDone }: Props) {
  const apply = useServerFn(applyTemplate);
  const gen = useServerFn(generateDkimKey);
  const [on, setOn] = useState({ spf: true, dkim: true, dmarc: true, mtaSts: false, tlsRpt: false, bimi: false, returnPath: false });
  const [spfIps, setSpfIps] = useState("");
  const [spfInc, setSpfInc] = useState("");
  const [spfPolicy, setSpfPolicy] = useState<"~all" | "-all">("-all");
  const [selector, setSelector] = useState("cortex");
  const [pub, setPub] = useState("");
  const [dmarcP, setDmarcP] = useState<"none" | "quarantine" | "reject">("quarantine");
  const [rua, setRua] = useState("");
  const [bimi, setBimi] = useState("");
  const [rpTarget, setRpTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const list = (s: string) => s.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);

  async function genKey() {
    const k = await gen();
    setPub(k.publicKey);
    download(`dkim-${selector}.private.pem`, k.privatePem);
    toast.success("DKIM key generated. The private key was downloaded: install it on your mail server.");
  }

  async function submit() {
    setBusy(true);
    const template = {
      ...(on.spf ? { spf: { ips: list(spfIps), includes: list(spfInc), policy: spfPolicy } } : {}),
      ...(on.dkim && pub ? { dkim: { selector, publicKey: pub.replace(/\s/g, "") } } : {}),
      ...(on.dmarc ? { dmarc: { policy: dmarcP, ...(rua ? { rua } : {}) } } : {}),
      ...(on.mtaSts ? { mtaSts: { id: new Date().toISOString().replace(/\D/g, "").slice(0, 14) } } : {}),
      ...(on.tlsRpt && rua ? { tlsRpt: { rua } } : {}),
      ...(on.bimi && bimi ? { bimi: { logoUrl: bimi } } : {}),
      ...(on.returnPath && rpTarget ? { returnPath: { sub: "bounce", target: rpTarget } } : {}),
    };
    let ok = 0, fail = 0;
    try {
      for (let i = 0; i < domainIds.length; i += 25) {
        const res = await apply({ data: { domainIds: domainIds.slice(i, i + 25), template } });
        for (const r of res) r.ok ? ok++ : (fail++, toast.error(r.message));
      }
      toast.success(`${ok} domains updated${fail ? `, ${fail} failed` : ""}`);
      onOpenChange(false);
      onDone?.();
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  }

  const Row = ({ k, label }: { k: keyof typeof on; label: string }) => (
    <label className="flex items-center justify-between text-sm font-medium"><span>{label}</span><Switch checked={on[k]} onCheckedChange={(v) => setOn({ ...on, [k]: v })} /></label>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Publish email records on {domainIds.length} domain{domainIds.length > 1 ? "s" : ""}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2 rounded-md border p-3">
            <Row k="spf" label="SPF" />
            {on.spf && <div className="grid gap-2 sm:grid-cols-3">
              <Input placeholder="Sending IPs" value={spfIps} onChange={(e) => setSpfIps(e.target.value)} />
              <Input placeholder="Includes, e.g. amazonses.com" value={spfInc} onChange={(e) => setSpfInc(e.target.value)} />
              <Select value={spfPolicy} onValueChange={(v) => setSpfPolicy(v as "~all" | "-all")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="-all">-all (strict)</SelectItem><SelectItem value="~all">~all (soft fail)</SelectItem></SelectContent></Select>
            </div>}
          </div>
          <div className="space-y-2 rounded-md border p-3">
            <Row k="dkim" label="DKIM" />
            {on.dkim && <>
              <div className="flex gap-2"><Input className="w-40" value={selector} onChange={(e) => setSelector(e.target.value)} placeholder="selector" /><Button type="button" variant="outline" onClick={genKey}><KeyRound className="h-3.5 w-3.5" /> Generate 2048-bit key</Button></div>
              <Textarea className="font-mono text-[11px]" rows={3} placeholder="Or paste an existing public key (base64, p= value)" value={pub} onChange={(e) => setPub(e.target.value)} />
            </>}
          </div>
          <div className="space-y-2 rounded-md border p-3">
            <Row k="dmarc" label="DMARC" />
            {on.dmarc && <div className="grid gap-2 sm:grid-cols-2">
              <Select value={dmarcP} onValueChange={(v) => setDmarcP(v as typeof dmarcP)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">p=none (monitor)</SelectItem><SelectItem value="quarantine">p=quarantine</SelectItem><SelectItem value="reject">p=reject</SelectItem></SelectContent></Select>
              <Input type="email" placeholder="Report address (rua)" value={rua} onChange={(e) => setRua(e.target.value)} />
            </div>}
          </div>
          <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
            <Row k="mtaSts" label="MTA-STS" />
            <Row k="tlsRpt" label="TLS-RPT (uses report address)" />
            <Row k="bimi" label="BIMI" />
            <Row k="returnPath" label="Bounce / Return-Path" />
            {on.bimi && <div className="space-y-1 sm:col-span-2"><Label className="text-xs">BIMI logo (HTTPS SVG)</Label><Input value={bimi} onChange={(e) => setBimi(e.target.value)} placeholder="https://example.com/logo.svg" /></div>}
            {on.returnPath && <div className="space-y-1 sm:col-span-2"><Label className="text-xs">bounce.&lt;domain&gt; CNAME target</Label><Input value={rpTarget} onChange={(e) => setRpTarget(e.target.value)} placeholder="bounces.yourmta.com" /></div>}
          </div>
          <p className="text-xs text-muted-foreground">Existing SPF, DKIM (same selector), DMARC, MTA-STS, TLS-RPT and BIMI records are replaced. Other records are left alone. Sav.com domains must use Cloudflare nameservers first.</p>
        </div>
        <DialogFooter><Button onClick={submit} disabled={busy || (on.dkim && !pub)}>{busy ? "Publishing…" : "Publish records"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
