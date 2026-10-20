import { describe, expect, it } from "vitest";
import { parseSuppressionInput } from "@/lib/suppression";

describe("global suppression input", () => {
  it("normalises case and removes duplicates", () => {
    expect(parseSuppressionInput("A@Example.com, a@example.com\nb@test.io").valid).toEqual(["a@example.com", "b@test.io"]);
  });
  it("rejects invalid addresses", () => {
    expect(parseSuppressionInput("not-an-email; x@y.co").invalid).toEqual(["not-an-email"]);
  });
});
