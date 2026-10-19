import { EMAIL_RE } from "./format";

export const SUB_FIELDS = ["email", "first_name", "last_name", "phone", "country", "region", "city", "language", "ip", "source"] as const;

function splitLine(line: string, sep: string) {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q;
    } else if (ch === sep && !q) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Parse CSV or TXT (one email per line). Returns valid unique rows plus counts of invalid and duplicate lines. */
export function parseSubscribers(text: string) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { rows: [], invalid: 0, duplicates: 0 };
  const sep = lines[0].includes(";") ? ";" : lines[0].includes(",") ? "," : lines[0].includes("\t") ? "\t" : ",";
  const head = splitLine(lines[0], sep).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  const hasHeader = head.includes("email");
  const cols = hasHeader ? head : ["email"];
  const seen = new Set<string>();
  let invalid = 0, duplicates = 0;
  const rows: Record<string, string>[] = [];
  for (const line of hasHeader ? lines.slice(1) : lines) {
    const vals = splitLine(line, sep);
    const r: Record<string, string> = {};
    cols.forEach((c, i) => { if ((SUB_FIELDS as readonly string[]).includes(c) && vals[i]) r[c] = vals[i]; });
    const email = (r.email ?? "").toLowerCase();
    if (!EMAIL_RE.test(email)) { invalid++; continue; }
    if (seen.has(email)) { duplicates++; continue; }
    seen.add(email);
    rows.push({ ...r, email });
  }
  return { rows, invalid, duplicates };
}

export function toCsv(rows: Record<string, unknown>[], cols: string[]) {
  const esc = (v: unknown) => {
    const s = v == null ? "" : Array.isArray(v) ? v.join("|") : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

export function download(name: string, content: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: "text/csv" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
