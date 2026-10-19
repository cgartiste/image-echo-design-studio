import { describe, expect, it } from "vitest";
import { parseSubscribers } from "@/lib/csv";

describe("subscriber import", () => {
  it("drops invalid addresses and duplicates", () => {
    const r = parseSubscribers("email,first_name\na@x.com,Ann\nnot-an-email,Bob\nA@x.com,Ann2\nb@y.org,Ben");
    expect(r.rows.map((x) => x.email)).toEqual(["a@x.com", "b@y.org"]);
    expect(r.invalid).toBe(1);
    expect(r.duplicates).toBe(1);
  });
  it("accepts plain TXT with one email per line", () => {
    expect(parseSubscribers("one@a.com\ntwo@b.com").rows).toHaveLength(2);
  });
});
