import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { t } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";
import { download, toCsv } from "@/lib/csv";
import { matchesVipFilter, type VipFilter } from "@/lib/vip-recipients";

export function VipRecipients({ enabled }: { enabled: boolean }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<VipFilter>("all");
  const [page, setPage] = useState(0);
  const q = useQuery({ queryKey: ["vip-recipients", page, search, filter], enabled, refetchInterval: 60_000, queryFn: async () => {
    let query = supabase.from("vip_recipients").select("*", { count: "exact" }).order("last_activity_at", { ascending: false });
    if (search.trim()) query = query.ilike("email", `%${search.trim().replace(/[%_]/g, "")}%`);
    if (filter === "clickers") query = query.gt("clicked_messages", 0);
    if (filter === "conversions") query = query.gt("conversions", 0);
    const { data, error, count } = await query.range(page * 100, page * 100 + 99);
    if (error) throw error;
    return { rows: data ?? [], count: count ?? 0 };
  } });
  const rows = (q.data?.rows ?? []).filter((r) => matchesVipFilter(r, filter));
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2">
      <Input className="w-full sm:w-64" placeholder={t("vip.search")} value={search} maxLength={255} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
      <Select value={filter} onValueChange={(v) => { if (v === "all" || v === "clickers" || v === "conversions") setFilter(v); setPage(0); }}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("vip.all")}</SelectItem><SelectItem value="clickers">{t("vip.clickers")}</SelectItem><SelectItem value="conversions">{t("vip.buyers")}</SelectItem></SelectContent></Select>
      <Button variant="outline" size="icon" aria-label={t("vip.refresh")} title={t("vip.refresh")} onClick={() => q.refetch()}><RefreshCw className="h-4 w-4" /></Button>
      <Button variant="outline" disabled={!rows.length} onClick={() => download("cortex-vip-page.csv", toCsv(rows, ["email", "clicked_messages", "conversions", "revenue", "campaigns", "first_activity_at", "last_activity_at"]))}><Download className="mr-2 h-4 w-4" />{t("vip.export")}</Button>
    </div>
    {q.error && <p className="text-sm text-destructive">{q.error.message}</p>}
    <div className="overflow-x-auto border rounded-md"><Table><TableHeader><TableRow>{["vip.email", "vip.clicks", "vip.conversions", "vip.revenue", "vip.campaigns", "vip.last"].map((key) => <TableHead key={key}>{t(key as "vip.email")}</TableHead>)}</TableRow></TableHeader><TableBody>
      {rows.map((r) => <TableRow key={r.email}><TableCell className="font-medium">{r.email}</TableCell><TableCell>{r.clicked_messages}</TableCell><TableCell>{r.conversions}</TableCell><TableCell>{r.revenue}</TableCell><TableCell className="max-w-64"><div className="truncate" title={r.campaigns?.join(", ")}>{r.campaigns?.join(", ")}</div></TableCell><TableCell>{r.last_activity_at ? fmtDate(r.last_activity_at) : "—"}</TableCell></TableRow>)}
      {!rows.length && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">{q.isPending ? t("vip.loading") : t("vip.empty")}</TableCell></TableRow>}
    </TableBody></Table></div>
    <div className="flex items-center justify-end gap-3 text-sm"><span>{page + 1} / {Math.max(1, Math.ceil((q.data?.count ?? 0) / 100))} · {q.data?.count ?? 0}</span><Button variant="outline" size="icon" aria-label="Previous page" disabled={page === 0} onClick={() => setPage(page - 1)}>←</Button><Button variant="outline" size="icon" aria-label="Next page" disabled={(page + 1) * 100 >= (q.data?.count ?? 0)} onClick={() => setPage(page + 1)}>→</Button></div>
  </div>;
}