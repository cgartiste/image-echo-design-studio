export const SUPPRESSION_REASONS = ["hard_bounce", "complaint", "unsubscribe", "manual", "legal"] as const;
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Splits pasted text into normalised, de-duplicated valid addresses and the rejected tokens. */
export function parseSuppressionInput(raw: string) {
  const tokens = raw.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const valid = [...new Set(tokens.filter((t) => EMAIL.test(t)))];
  const invalid = tokens.filter((t) => !EMAIL.test(t));
  return { valid, invalid };
}
