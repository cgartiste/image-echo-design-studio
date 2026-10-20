export type VariantStats = { variant: string; sent: number; opened: number; clicked: number };
export type Metric = "open" | "click";

export const rate = (v: VariantStats, m: Metric) => (v.sent ? (m === "open" ? v.opened : v.clicked) / v.sent : 0);

/** Normal CDF approximation (Abramowitz–Stegun). */
function phi(z: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/** Confidence (0–1) that `a` truly beats `b`, two-proportion z-test. */
export function confidence(a: VariantStats, b: VariantStats, m: Metric): number {
  if (!a.sent || !b.sent) return 0;
  const pa = rate(a, m), pb = rate(b, m);
  const pool = ((m === "open" ? a.opened + b.opened : a.clicked + b.clicked)) / (a.sent + b.sent);
  const se = Math.sqrt(pool * (1 - pool) * (1 / a.sent + 1 / b.sent));
  if (!se) return pa > pb ? 1 : 0.5;
  return phi((pa - pb) / se);
}

/** Best variant and its confidence against the runner-up; a winner needs ≥ minSent each and ≥ 95%. */
export function pickWinner(stats: VariantStats[], m: Metric, minSent = 100) {
  const sorted = [...stats].sort((x, y) => rate(y, m) - rate(x, m));
  const [best, second] = sorted;
  if (!best || !second) return { leader: best?.variant ?? null, confidence: 0, decisive: false };
  const c = confidence(best, second, m);
  const decisive = stats.every((s) => s.sent >= minSent) && c >= 0.95;
  return { leader: best.variant, confidence: c, decisive };
}
