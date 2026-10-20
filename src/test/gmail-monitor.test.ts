import { expect, it } from "vitest";
import { gmailMonitorSchema } from "@/lib/gmail-monitor";
it("requires a sender or subject for automated placement tests", () => {
  expect(gmailMonitorSchema.safeParse({ subject: "", from: "", minutes: 5 }).success).toBe(false);
  expect(gmailMonitorSchema.safeParse({ subject: "", from: "mail.example.com", minutes: 5 }).success).toBe(true);
});