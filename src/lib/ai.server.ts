import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

/** One-shot Lovable AI call; streams upstream and returns the final text. */
export async function askAI(instructions: string, prompt: string, signal?: AbortSignal): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured");
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
  });
  let failure: unknown = null;
  const result = streamText({
    model: provider.responses("openai/gpt-6-astra"),
    instructions,
    messages: [{ role: "user", content: prompt }],
    ...(signal ? { abortSignal: signal } : {}),
    onError: ({ error }) => { failure = error; },
    providerOptions: { openai: { store: false, forceReasoning: true, reasoningEffort: "medium", reasoningSummary: "auto", include: ["reasoning.encrypted_content"] } },
  });
  const text = await result.text;
  if (failure) {
    const e = failure as { statusCode?: number; responseBody?: string; message?: string };
    console.error("AI call failed", e.statusCode, e.responseBody ?? e.message);
    if (e.statusCode === 402) throw new Error("AI credits are used up — add credits in Settings → Plans & credits.");
    if (e.statusCode === 429) throw new Error("AI is busy right now — try again in a minute.");
    throw new Error(`AI request failed${e.statusCode ? ` (${e.statusCode})` : ""}`);
  }
  if (!text.trim()) throw new Error("The AI returned no answer.");
  return text;
}
