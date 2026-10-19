// Spintax + random tags. Deterministic when a seed is given so previews are reproducible.
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const ALNUM = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Resolves {a|b|c}, {{spin:a|b}}, {{random_number:N}}, {{random_string:N}}, {{random_id}}, {{timestamp}}. */
export function spin(text: string, seed = Date.now()): string {
  const r = rng(seed);
  const pick = (opts: string[]) => opts[Math.floor(r() * opts.length)] ?? "";
  let out = text.replace(/\{\{\s*spin:([^}]*)\}\}/g, (_, o: string) => pick(o.split("|")));
  out = out.replace(/\{\{\s*random_number:(\d{1,2})\s*\}\}/g, (_, n: string) => Array.from({ length: +n }, () => Math.floor(r() * 10)).join(""));
  out = out.replace(/\{\{\s*random_string:(\d{1,2})\s*\}\}/g, (_, n: string) => Array.from({ length: +n }, () => ALNUM[Math.floor(r() * 36)]).join(""));
  out = out.replace(/\{\{\s*random_id\s*\}\}/g, () => Array.from({ length: 12 }, () => ALNUM[Math.floor(r() * 36)]).join(""));
  out = out.replace(/\{\{\s*timestamp\s*\}\}/g, () => String(Math.floor(seed / 1000)));
  // Single-brace spintax, innermost first (supports nesting). Skips {{var}} placeholders.
  const re = /(?<!\{)\{([^{}]*\|[^{}]*)\}(?!\})/;
  for (let i = 0; i < 200 && re.test(out); i++) out = out.replace(re, (_, o: string) => pick(o.split("|")));
  return out;
}

/** Number of distinct combinations from top-level spintax groups (capped). */
export function spinCount(text: string): number {
  let n = 1;
  for (const m of text.matchAll(/(?<!\{)\{([^{}]*\|[^{}]*)\}(?!\})|\{\{\s*spin:([^}]*)\}\}/g)) n = Math.min(n * (m[1] ?? m[2] ?? "").split("|").length, 1e9);
  return n;
}

const SPAM_WORDS = ["free", "gratuit", "urgent", "winner", "gagnant", "cash", "100%", "click here", "cliquez ici", "act now", "guarantee", "garanti", "viagra", "casino", "credit", "crédit", "$$$", "€€€", "risk free", "sans risque", "limited time", "offre limitée"];
export function spamScore(subject: string, html: string) {
  const text = `${subject} ${html.replace(/<[^>]+>/g, " ")}`.toLowerCase();
  const hits = SPAM_WORDS.filter(w => text.includes(w));
  const caps = subject.replace(/[^A-Za-z]/g, "");
  const upper = caps.length > 5 && caps.replace(/[^A-Z]/g, "").length / caps.length > 0.6;
  const bangs = (subject.match(/!/g) ?? []).length > 1;
  const score = Math.min(10, hits.length * 1.5 + (upper ? 2 : 0) + (bangs ? 1.5 : 0));
  return { score, hits, upper, bangs };
}

/** Splits a recipient count across A/B variants. testPercent of the audience is tested, the rest goes to the winner. */
export function abSplit(total: number, variants: number, testPercent: number, mode: "equal" | "sample") {
  if (variants < 2) return { perVariant: [total], winner: 0 };
  const tested = mode === "equal" ? total : Math.floor((total * Math.min(100, Math.max(1, testPercent))) / 100);
  const base = Math.floor(tested / variants);
  const perVariant = Array.from({ length: variants }, (_, i) => base + (i < tested - base * variants ? 1 : 0));
  return { perVariant, winner: total - tested };
}

/** Random delay between min and max seconds. */
export function jitter(min: number, max: number, r = Math.random) {
  const lo = Math.min(min, max), hi = Math.max(min, max);
  return lo + r() * (hi - lo);
}
