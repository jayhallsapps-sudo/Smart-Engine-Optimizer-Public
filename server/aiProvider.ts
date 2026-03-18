/**
 * Shared AI provider utility — Anthropic → Groq → Gemini → OpenAI fallback
 *
 * Used by all SmartEO features that need AI completions.
 * Tries each provider in order; falls through on any error.
 * Also tracks which provider is currently active for the footer status indicator.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

// ─── Active provider tracking ─────────────────────────────────────────────────

type Provider = "claude" | "groq" | "gemini" | "openai";

const activeCounts: Record<Provider, number> = { claude: 0, groq: 0, gemini: 0, openai: 0 };

function increment(p: Provider) { activeCounts[p] = (activeCounts[p] || 0) + 1; }
function decrement(p: Provider) { activeCounts[p] = Math.max(0, (activeCounts[p] || 1) - 1); }

/** Called by ACA (claudeService) to register its own active provider */
export function setAiActive(provider: Provider, active: boolean) {
  if (active) increment(provider);
  else decrement(provider);
}

/** Returns the provider currently handling at least one call, or null */
export function getAiStatus(): { provider: Provider | null; label: string } {
  const order: Provider[] = ["claude", "groq", "gemini", "openai"];
  const active = order.find(p => activeCounts[p] > 0) ?? null;
  const labels: Record<Provider, string> = {
    claude: "Claude (Anthropic)",
    groq: "Groq (Llama)",
    gemini: "Gemini (Google)",
    openai: "OpenAI (GPT-4o)",
  };
  return { provider: active, label: active ? labels[active] : "None" };
}

// ─── Core callAIJson ─────────────────────────────────────────────────────────

interface AiCallOptions {
  maxOutputTokens?: number;
}

/**
 * Call an AI model for a JSON-completion task.
 * Returns the parsed JSON object and the provider that succeeded.
 * Order: Anthropic (Claude) → Groq (Llama) → Gemini (Google) → OpenAI (GPT-4o)
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
      increment("claude");
      try {
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
      } finally {
        decrement("claude");
      }
    } catch (err: any) {
      console.error("[AI] Claude failed:", err?.status ?? "", err?.message?.slice(0, 200));
    }
  }

  if (process.env.GROQ_API_KEY) {
    try {
      console.log("[AI] Trying provider: groq");
      increment("groq");
      try {
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
      } finally {
        decrement("groq");
      }
    } catch (err: any) {
      console.error("[AI] Groq failed:", err?.status ?? "", err?.message?.slice(0, 200));
    }
  }

  if (process.env.GEMINI_API_KEY) {
    try {
      console.log("[AI] Trying provider: gemini");
      increment("gemini");
      try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
          model: process.env.GEMINI_MODEL || "gemini-1.5-flash",
          generationConfig: {
            responseMimeType: "application/json",
            maxOutputTokens: maxTokens,
          },
          systemInstruction: systemPrompt + "\n\nIMPORTANT: Return ONLY valid JSON with no markdown code blocks or extra commentary.",
        });
        const chat = model.startChat();
        const response = await chat.sendMessage(userPrompt);
        const text = response.response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON object in Gemini response");
        const result = JSON.parse(jsonMatch[0]);
        return { result, provider: "gemini" };
      } finally {
        decrement("gemini");
      }
    } catch (err: any) {
      console.error("[AI] Gemini failed:", err?.status ?? "", err?.message?.slice(0, 200));
    }
  }

  if (process.env.OPENAI_API_KEY) {
    try {
      console.log("[AI] Trying provider: openai");
      increment("openai");
      try {
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
      } finally {
        decrement("openai");
      }
    } catch (err: any) {
      console.error("[AI] OpenAI failed:", err?.status ?? "", err?.message?.slice(0, 200));
    }
  }

  throw new Error(
    "All AI providers failed or are unconfigured. Add at least one key in Secrets: ANTHROPIC_API_KEY, GROQ_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY."
  );
}
