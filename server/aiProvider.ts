/**
 * Shared AI provider utility — Anthropic → Groq → OpenAI fallback
 *
 * Used by all SmartEO features that need AI completions.
 * Tries each provider in order; falls through on any error.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

interface AiCallOptions {
  maxOutputTokens?: number;
}

/**
 * Call an AI model for a JSON-completion task.
 * Returns the parsed JSON object and the provider that succeeded.
 * Order: Anthropic (Claude) → Groq (Llama) → OpenAI (GPT-4o)
 */
export async function callAIJson(
  systemPrompt: string,
  userPrompt: string,
  options: AiCallOptions = {}
): Promise<{ result: any; provider: string }> {
  const maxTokens = options.maxOutputTokens ?? 8000;

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      console.log("[AI] Trying provider: claude");
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const response = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
        max_tokens: maxTokens,
        system: systemPrompt + "\n\nIMPORTANT: Return ONLY valid JSON with no markdown code blocks or extra commentary.",
        messages: [{ role: "user", content: userPrompt }],
      });
      const text = response.content[0]?.type === "text" ? response.content[0].text : "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON object in Claude response");
      const result = JSON.parse(jsonMatch[0]);
      return { result, provider: "claude" };
    } catch (err: any) {
      console.error("[AI] Claude failed:", err?.status ?? "", err?.message?.slice(0, 200));
    }
  }

  if (process.env.GROQ_API_KEY) {
    try {
      console.log("[AI] Trying provider: groq");
      const groq = new OpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: "https://api.groq.com/openai/v1",
      });
      const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
      const completion = await groq.chat.completions.create({
        model,
        max_tokens: Math.min(maxTokens, 8000),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      });
      const text = completion.choices[0].message.content || "";
      const result = JSON.parse(text);
      return { result, provider: "groq" };
    } catch (err: any) {
      console.error("[AI] Groq failed:", err?.status ?? "", err?.message?.slice(0, 200));
    }
  }

  if (process.env.OPENAI_API_KEY) {
    try {
      console.log("[AI] Trying provider: openai");
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const model = process.env.OPENAI_MODEL || "gpt-4o";
      const completion = await openai.chat.completions.create({
        model,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      });
      const text = completion.choices[0].message.content || "";
      const result = JSON.parse(text);
      return { result, provider: "openai" };
    } catch (err: any) {
      console.error("[AI] OpenAI failed:", err?.status ?? "", err?.message?.slice(0, 200));
    }
  }

  throw new Error(
    "All AI providers failed or are unconfigured. Add at least one key in Secrets: ANTHROPIC_API_KEY, GROQ_API_KEY, or OPENAI_API_KEY."
  );
}
