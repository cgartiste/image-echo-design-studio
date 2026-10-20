import { describe, expect, it } from "vitest";
import { pickWinner } from "@/lib/ab-stats";

describe("A/B winner", () => {
  it("declares a clear winner at 95%+ confidence", () => {
    const r = pickWinner([{ variant: "A", sent: 1000, opened: 300, clicked: 0 }, { variant: "B", sent: 1000, opened: 200, clicked: 0 }], "open");
    expect(r.leader).toBe("A");
    expect(r.decisive).toBe(true);
  });
  it("refuses to decide on a tiny difference", () => {
    expect(pickWinner([{ variant: "A", sent: 1000, opened: 205, clicked: 0 }, { variant: "B", sent: 1000, opened: 200, clicked: 0 }], "open").decisive).toBe(false);
  });
  it("refuses to decide below 100 sends per variant", () => {
    expect(pickWinner([{ variant: "A", sent: 50, opened: 40, clicked: 0 }, { variant: "B", sent: 50, opened: 5, clicked: 0 }], "open").decisive).toBe(false);
  });
});
