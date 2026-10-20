// Browser-safe month-grid helpers for the campaign calendar.
/** The date a campaign appears on: scheduled, else started, else created. */
export function campaignDay(c: { scheduled_at: string | null; started_at: string | null; created_at: string }): string {
  return (c.scheduled_at ?? c.started_at ?? c.created_at).slice(0, 10);
}

/** 6x7 grid of ISO days (YYYY-MM-DD), weeks starting Monday, for the given year/month (0-based). */
export function monthGrid(year: number, month: number): string[] {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => new Date(Date.UTC(year, month, 1 - offset + i)).toISOString().slice(0, 10));
}
