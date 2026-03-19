import { callAIJson } from "./aiProvider";

export const NARRATION_PROMPT_VERSION = "v2026-03-19";

// ─── Base Types ───────────────────────────────────────────────────────────────

export interface SourceFacts {
  windowLabel: string;
  aiNarrationUsed: boolean;
  aiNarrationProvider?: string | null;
  fallbackTriggered: boolean;
  promptVersion: string;
  generatedAt: string;
}

export interface MonthlySourceFacts extends SourceFacts {
  airtableRecords: number;
  asanaCompleted: number;
  asanaUpcoming: number;
  hasGsc: boolean;
  hasGa4: boolean;
  rawWorkLogItems: RawWorkItem[];
  rawNextPriorityItems: string[];
}

export interface QbrFullSourceFacts extends SourceFacts {
  airtableRecords: number;
  asanaRecords: number;
  hasGsc: boolean;
  hasGa4: boolean;
  hasCalls: boolean;
  rawWorkLogItems: RawWorkItem[];
}

export interface QbrPrepSourceFacts extends SourceFacts {
  hasGsc: boolean;
  hasGa4: boolean;
  hasSf: boolean;
  totalOpportunities: number;
  opportunityCategories: number;
  winCount: number;
  categoryNames: string[];
}

export interface MidStrategySourceFacts extends SourceFacts {
  crawlUrlCount: number;
  hasGa4: boolean;
  hasGsc: boolean;
  integrationGapCount: number;
  slideCount: number;
  dataSourcesUsed: string[];
}

// ─── Raw Work Item ────────────────────────────────────────────────────────────

export interface RawWorkItem {
  area: string;
  task: string;
  url?: string;
}

// ─── Deterministic Non-AI Formatter ──────────────────────────────────────────
// When AI is unavailable, this produces clean client-safe copy.
// No raw task titles pass through verbatim.

export function formatRawTask(area: string, task: string, url?: string): string {
  const clean = task
    .replace(/^\*+/, "")
    .replace(/\*+$/, "")
    .trim()
    .replace(/\s+/g, " ");
  const hasUrl = url && url !== "—" && url.trim().length > 0;
  const urlSuffix = hasUrl ? ` (${url!.trim()})` : "";
  const areaLow = area.toLowerCase();

  // Content / Blog
  if (/content|blog|article|post|copy|page/i.test(areaLow)) {
    if (/blog|article|post/i.test(clean)) {
      const stripped = clean.replace(/^(blog\s*[:–-]?\s*|article\s*[:–-]?\s*|post\s*[:–-]?\s*)/i, "");
      return `Published new content: ${stripped}${urlSuffix}.`;
    }
    return `Completed content deliverable: ${clean}${urlSuffix}.`;
  }

  // Optimization / CRO
  if (/optim|cro|conversion|title\s*tag|meta\s*desc|refresh|rewrite/i.test(areaLow)) {
    if (/title.*tag|meta.*desc/i.test(clean)) {
      return `Refreshed title tag and meta description${urlSuffix}.`;
    }
    if (/rewrite|refresh/i.test(clean)) {
      return `Refreshed page content for improved relevance${urlSuffix}.`;
    }
    return `Completed optimization update: ${clean}${urlSuffix}.`;
  }

  // Technical
  if (/tech|crawl|redirect|schema|speed|core\s*web|canonical|sitemap|404/i.test(areaLow)) {
    return `Resolved technical issue: ${clean}${urlSuffix}.`;
  }

  // Local / GBP
  if (/local|gbp|google\s*business|citation/i.test(areaLow)) {
    return `Completed local SEO work: ${clean}${urlSuffix}.`;
  }

  // Link building / Authority
  if (/link|authorit|backlink|outreach/i.test(areaLow)) {
    return `Completed link building activity: ${clean}${urlSuffix}.`;
  }

  // Generic fallback — still clean, no verbatim dump
  const cap = clean.charAt(0).toUpperCase() + clean.slice(1);
  const ended = /[.!?]$/.test(cap) ? cap : `${cap}.`;
  return hasUrl ? `${ended} (${url!.trim()})` : ended;
}

// ─── AI Narration for Work Log ────────────────────────────────────────────────

interface NarrateWorkLogResult {
  narratedRows: Array<{ area: string; task: string; url?: string }>;
  provider: string | null;
  fallbackTriggered: boolean;
}

export async function narrateWorkLog(
  items: RawWorkItem[],
  windowLabel: string,
  reportContext: "monthly" | "qbr_full" = "monthly"
): Promise<NarrateWorkLogResult> {
  if (items.length === 0) {
    return { narratedRows: [], provider: null, fallbackTriggered: false };
  }

  const contextNote =
    reportContext === "qbr_full"
      ? "This is a Quarterly Business Review (QBR) — executive-level client-facing language."
      : "This is a Monthly SEO Report — clear, professional client-facing language.";

  const systemPrompt = `You are a senior SEO account manager writing client-facing report copy for behavioral health treatment centers.
${contextNote}

Translate each raw task record into a polished, professional client-facing sentence.

Rules:
- NEVER use phrases like "continued efforts", "ongoing maintenance", "initiated", "commenced", or "is underway"
- State clearly what was DONE, PUBLISHED, FIXED, or OPTIMIZED
- Connect each item to its SEO or business benefit in 5-10 words max
- Write in past tense
- Be specific — mention the page, topic, or fix type
- Keep each bullet under 25 words
- Return compact JSON only, no explanation`;

  const userPrompt = `Reporting window: ${windowLabel}

Work completed (raw data):
${JSON.stringify(items.map(i => ({ area: i.area, task: i.task, url: i.url && i.url !== "—" ? i.url : undefined })), null, 2)}

Return JSON:
{
  "narratedRows": [
    { "area": "Content", "task": "narrated sentence here", "url": "/the-original-url-if-any" },
    ...
  ]
}

One output object per input item, in the same order. Preserve the original area and url values exactly.`;

  try {
    const { result, provider } = await callAIJson(systemPrompt, userPrompt, { maxOutputTokens: 1200 });
    const rows: Array<{ area: string; task: string; url?: string }> = (result.narratedRows ?? []).map(
      (r: any, idx: number) => ({
        area: r.area ?? items[idx]?.area ?? "",
        task: typeof r.task === "string" && r.task.trim().length > 0 ? r.task.trim() : formatRawTask(items[idx]?.area ?? "", items[idx]?.task ?? ""),
        url: r.url ?? items[idx]?.url,
      })
    );
    if (rows.length === 0) throw new Error("empty narration result");
    return { narratedRows: rows, provider, fallbackTriggered: false };
  } catch {
    return {
      narratedRows: items.map(i => ({ area: i.area, task: formatRawTask(i.area, i.task, i.url), url: i.url })),
      provider: null,
      fallbackTriggered: true,
    };
  }
}

// ─── AI Narration for Priority Bullets ───────────────────────────────────────

interface NarratePrioritiesResult {
  bullets: string[];
  provider: string | null;
  fallbackTriggered: boolean;
}

export async function narratePriorities(
  rawItems: string[],
  windowLabel: string,
  reportType: "monthly_next" | "qbr_tactics" = "monthly_next"
): Promise<NarratePrioritiesResult> {
  if (rawItems.length === 0) return { bullets: [], provider: null, fallbackTriggered: false };

  const isNextMonth = reportType === "monthly_next";
  const contextNote = isNextMonth
    ? "These are upcoming priorities for next month in an SEO Monthly Report."
    : "These are upcoming quarterly tactics for a QBR.";

  const systemPrompt = `You are a senior SEO account manager writing client-facing report copy.
${contextNote}

Translate raw task names into clear, client-facing priority bullets.
Rules:
- Write in future tense ("We will...", "Continue...", "Launch...")
- Be specific — name the actual work or metric
- Connect to SEO business value where possible
- No generic filler like "continue efforts" or "work on improvements"
- Keep each bullet under 20 words
- Return compact JSON only`;

  const userPrompt = `Period: ${windowLabel}

Raw items:
${rawItems.map((r, i) => `${i + 1}. ${r}`).join("\n")}

Return JSON:
{ "bullets": ["narrated bullet 1", "narrated bullet 2", ...] }

Same count and order as input.`;

  try {
    const { result, provider } = await callAIJson(systemPrompt, userPrompt, { maxOutputTokens: 800 });
    const bullets: string[] = (result.bullets ?? []).filter((b: any) => typeof b === "string" && b.trim().length > 0);
    if (bullets.length === 0) throw new Error("empty bullets");
    return { bullets, provider, fallbackTriggered: false };
  } catch {
    // Deterministic fallback: capitalise + ensure period
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    const end = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);
    return {
      bullets: rawItems.map(r => end(cap(r.trim()))),
      provider: null,
      fallbackTriggered: true,
    };
  }
}

// ─── Specific fallback copy for empty-section states ─────────────────────────

export function noContentFallback(area: string, period: string): string {
  switch (area.toLowerCase()) {
    case "content":
      return `No new content was published during ${period}.`;
    case "optimization":
    case "cro":
      return `No page optimization updates were completed during ${period}.`;
    case "technical":
    case "technical seo":
      return `No completed technical fixes were logged for ${period}.`;
    case "local":
    case "local seo":
      return `No local SEO or Google Business Profile work was completed during ${period}.`;
    default:
      return `No work was logged under "${area}" for ${period}.`;
  }
}
