import { describe, it, expect } from "vitest";
import { spin, spinCount, abSplit, spamScore } from "@/lib/spintax";

describe("spintax", () => {
  it("picks one option and keeps {{vars}}", () => {
    const out = spin("{Bonjour|Salut} {{first_name}}", 42);
    expect(["Bonjour {{first_name}}", "Salut {{first_name}}"]).toContain(out);
  });
  it("random_number length", () => { expect(spin("{{random_number:6}}", 7)).toMatch(/^\d{6}$/); });
  it("counts combinations", () => { expect(spinCount("{a|b} {c|d|e}")).toBe(6); });
  it("sample split: 20% tested over 2 variants, 80% winner", () => {
    expect(abSplit(1000, 2, 20, "sample")).toEqual({ perVariant: [100, 100], winner: 800 });
  });
  it("equal split leaves no winner group", () => { expect(abSplit(10, 3, 20, "equal")).toEqual({ perVariant: [4, 3, 3], winner: 0 }); });
  it("flags spam words", () => { expect(spamScore("GRATUIT URGENT!!", "").score).toBeGreaterThan(3); });
});
