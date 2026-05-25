/**
 * Shared AI provider utility — tier-aware fallback chain.
 *
 * Used by all SmartEO features that need AI completions.
 * Tries providers in an order driven by the requested tier, falling through
 * on any error (rate-limit 429s included). Also tracks active provider for
 * the footer status indicator.
 *
 * Tiers (Phase 3f):
 *   - "deep"      — heavy synthesis (exec summary, EEAT, intent classification).
 *                   Anthropic Claude Sonnet 4 first; falls back to OpenAI → Gemini → Groq.
 *   - "balanced"  — single-slide commentary on diagnostic data.
 *                   Gemini 2.0 Flash first; falls back to Groq → Claude → OpenAI.
 *   - "fast"      — per-row rewrites (cluster notes, priority bullets).
 *                   Groq Llama-3.1-8b first; falls back to Gemini Flash-8b → Claude → OpenAI.
 *
 * Backward compatibility: when no tier is passed, defaults to "deep" so existing
 * callers (reportNarration legacy paths, discoverability in routes.ts) see no
 * behaviour change.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

// ─── Active provider tracking ─────────────────────────────────────────────────

type Provider = "claude" | "groq" | "gemini" | "openai";
export type AiTier = "deep" | "balanced" | "fast";

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

// ─── Tier → provider chain + model selection ─────────────────────────────────

function chainForTier(tier: AiTier): Provider[] {
  switch (tier) {
    case "deep":     return ["claude", "openai", "gemini", "groq"];
    case "balanced": return ["gemini", "groq", "claude", "openai"];
    case "fast":     return ["groq", "gemini", "claude", "openai"];
  }
}

// Per-provider model list ordered for the given tier. Models inside a provider
// are tried in order — used to step down within Groq/Gemini on rate-limit 429s.
function modelsForProviderAtTier(provider: Provider, tier: AiTier): string[] {
  if (provider === "claude") {
    return [process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514"];
  }
  if (provider === "groq") {
    if (process.env.GROQ_MODEL) return [process.env.GROQ_MODEL];
    return tier === "fast"
      ? ["llama-3.1-8b-instant", "llama-3.3-70b-versatile"]
      : ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
  }
  if (provider === "gemini") {
    if (process.env.GEMINI_MODEL) return [process.env.GEMINI_MODEL];
    return tier === "fast"
      ? ["gemini-1.5-flash-8b", "gemini-2.0-flash"]
      : ["gemini-2.0-flash", "gemini-1.5-flash-8b"];
  }
  return [process.env.OPENAI_MODEL || "gpt-4o"];
}

// ─── Per-provider call helpers ───────────────────────────────────────────────

async function callClaude(systemPrompt: string, userPrompt: string, model: string, maxTokens: number): Promise<any> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt + "\n\nIMPORTANT: Return ONLY valid JSON with no markdown code blocks or extra commentary.",
    messages: [{ role: "user", content: userPrompt }],
  });
  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON object in Claude response");
  return JSON.parse(jsonMatch[0]);
}

async function callGroq(systemPrompt: string, userPrompt: string, model: string, maxTokens: number): Promise<any> {
  const groq = new OpenAI({
    apiKey: process.env.GROQ_API_KEY!,
    baseURL: "https://api.groq.com/openai/v1",
  });
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
  return JSON.parse(text);
}

async function callGemini(systemPrompt: string, userPrompt: string, modelName: string, maxTokens: number): Promise<any> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: modelName,
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
  return JSON.parse(jsonMatch[0]);
}

async function callOpenAI(systemPrompt: string, userPrompt: string, model: string, maxTokens: number): Promise<any> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
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
  return JSON.parse(text);
}

function providerConfigured(p: Provider): boolean {
  switch (p) {
    case "claude": return !!process.env.ANTHROPIC_API_KEY;
    case "groq":   return !!process.env.GROQ_API_KEY;
    case "gemini": return !!process.env.GEMINI_API_KEY;
    case "openai": return !!process.env.OPENAI_API_KEY;
  }
}

// ─── Core callAIJson ─────────────────────────────────────────────────────────

interface AiCallOptions {
  maxOutputTokens?: number;
  tier?: AiTier;
}

/**
 * Call an AI model for a JSON-completion task.
 * Returns the parsed JSON object and the provider that succeeded.
 *
 * Provider order is determined by `tier` (defaults to "deep" for backward
 * compatibility). Within each provider, models cascade on rate-limit (429)
 * errors only — other errors propagate to the next provider.
 */
export async function callAIJson(
  systemPrompt: string,
  userPrompt: string,
  options: AiCallOptions = {}
): Promise<{ result: any; provider: string }> {
  const maxTokens = options.maxOutputTokens ?? 8000;
  const tier: AiTier = options.tier ?? "deep";
  const chain = chainForTier(tier);

  for (const provider of chain) {
    if (!providerConfigured(provider)) continue;

    const models = modelsForProviderAtTier(provider, tier);
    for (const model of models) {
      try {
        console.log(`[AI] tier=${tier} provider=${provider} model=${model}`);
        increment(provider);
        try {
          let result: any;
          if (provider === "claude")      result = await callClaude(systemPrompt, userPrompt, model, maxTokens);
          else if (provider === "groq")   result = await callGroq(systemPrompt, userPrompt, model, maxTokens);
          else if (provider === "gemini") result = await callGemini(systemPrompt, userPrompt, model, maxTokens);
          else                            result = await callOpenAI(systemPrompt, userPrompt, model, maxTokens);
          return { result, provider };
        } finally {
          decrement(provider);
        }
      } catch (err: any) {
        const status = err?.status ?? "";
        console.error(`[AI] ${provider}/${model} failed: ${status} ${err?.message?.slice(0, 200) ?? ""}`);
        // Step to the next intra-provider model only on rate-limit (429) or
        // model-not-found (404 for Gemini). Other errors fall through to the
        // next provider in the chain.
        if (provider === "groq" && status === 429) continue;
        if (provider === "gemini" && (status === 429 || status === 404)) continue;
        break;
      }
    }
  }

  throw new Error(
    "All AI providers failed or are unconfigured. Add at least one key in Secrets: ANTHROPIC_API_KEY, GROQ_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY."
  );
}
