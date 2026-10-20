// Browser-safe management report totals.
type C = { sent: number; delivered: number; opens: number; clicks: number; bounces: number; complaints: number; conversions: number; revenue: number; cost: number };
export function reportTotals(rows: C[]) {
  const t = rows.reduce((a, r) => { (Object.keys(a) as (keyof C)[]).forEach((k) => { a[k] += Number(r[k]) || 0; }); return a; },
    { sent: 0, delivered: 0, opens: 0, clicks: 0, bounces: 0, complaints: 0, conversions: 0, revenue: 0, cost: 0 } as C);
  const rate = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 10000) / 100 : 0);
  return { ...t, campaigns: rows.length, profit: t.revenue - t.cost, roi: t.cost > 0 ? rate(t.revenue - t.cost, t.cost) : null,
    openRate: rate(t.opens, t.delivered), clickRate: rate(t.clicks, t.delivered), bounceRate: rate(t.bounces, t.sent), complaintRate: rate(t.complaints, t.delivered) };
}
