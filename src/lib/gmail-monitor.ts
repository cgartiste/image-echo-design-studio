import { z } from "zod";
export const gmailMonitorSchema = z.object({
  subject: z.string().trim().max(200),
  from: z.string().trim().max(200),
  minutes: z.number().int().min(5).max(60),
}).refine((v) => Boolean(v.subject || v.from), "Enter a subject or a sender");