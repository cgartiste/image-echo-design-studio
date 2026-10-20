export type VipFilter = "all" | "clickers" | "conversions";
export function matchesVipFilter(row: { clicked_messages: number | null; conversions: number | null }, filter: VipFilter) {
  if (filter === "clickers") return (row.clicked_messages ?? 0) > 0;
  if (filter === "conversions") return (row.conversions ?? 0) > 0;
  return (row.clicked_messages ?? 0) > 0 || (row.conversions ?? 0) > 0;
}