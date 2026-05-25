import { callAIJson, type AiTier } from "./aiProvider";

export const NARRATION_PROMPT_VERSION = "v2026-05-25-mv2";

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

// ─── Phase 3f — V2 Monthly slide narrations ──────────────────────────────────
// One narrate* function per V2 slide that needs AI copy. Each routes to the
// appropriate AI tier (deep / balanced / fast) and falls back to null on
// failure so the generator can keep its placeholder string.

const BRAND_VOICE = `Voice rules:
- Lead with business outcomes (calls, form fills, VOBs, admissions, qualified leads). Keywords and traffic are diagnostic — never the headline.
- No cheerleading. Never use "great", "amazing", "fantastic", exclamation marks. Treatment centers don't need pep talks.
- Cite specific numbers, page paths, or movements. Avoid filler phrases like "continued efforts", "ongoing maintenance".
- Past tense for what happened. Future tense for what's next.
- Concise. No emojis. No markdown formatting inside JSON strings.`;

const VERTICAL_CONTEXT = `Context: SEO monthly report for a behavioral health / addiction treatment center client. The audience is the client business owner or marketing director — sophisticated but time-pressed.`;

interface CommentaryResult {
  commentary: string | null;
  provider: string | null;
  fallbackTriggered: boolean;
}

// Shared helper for narrations that return a single "commentary" string.
async function narrateCommentary(opts: {
  tier: AiTier;
  maxTokens: number;
  systemPrompt: string;
  userPrompt: string;
}): Promise<CommentaryResult> {
  try {
    const { result, provider } = await callAIJson(
      opts.systemPrompt,
      opts.userPrompt,
      { tier: opts.tier, maxOutputTokens: opts.maxTokens },
    );
    const commentary = typeof result.commentary === "string" && result.commentary.trim().length > 0
      ? result.commentary.trim()
      : null;
    if (!commentary) throw new Error("empty commentary");
    return { commentary, provider, fallbackTriggered: false };
  } catch {
    return { commentary: null, provider: null, fallbackTriggered: true };
  }
}

// ─── Slide 2: Executive summary (deep) ──────────────────────────────────────

export interface ExecSummaryInput {
  clientName: string;
  windowLabel: string;
  outcomeMetrics: Array<{ label: string; current: string; delta?: string; isPositive?: boolean }>;
  pacingBadges: Array<{ label: string; current: string; goal: string; status: string; pacingPercent: string }>;
  visibilityMetrics: Array<{ label: string; current: string; delta?: string; isPositive?: boolean }>;
  topClusters: Array<{ topic: string; clicks: number; deltaClicks: string; intent: string }>;
  eeatSummary?: {
    totalPagesScanned: number;
    pagesWithAuthorSchema: number;
    pagesWithReviewerInfo: number;
    pagesWithFaqs: number;
    shellPagesDetected: number;
  } | null;
  ahrefsDomainRating?: string | null;
  airtablePublished: number;
  asanaCompleted: number;
}

export interface ExecSummaryResult {
  headline: string | null;
  narrative: string | null;
  keyMoves: string[];
  provider: string | null;
  fallbackTriggered: boolean;
}

export async function narrateExecSummary(input: ExecSummaryInput): Promise<ExecSummaryResult> {
  const systemPrompt = `You are a senior SEO account manager writing the headline + executive summary slide of a Monthly Report.
${VERTICAL_CONTEXT}
${BRAND_VOICE}

Produce three things:
1. A 6-12 word headline capturing the single most important story this month.
2. A 3-5 sentence executive narrative that leads with business outcomes, ties them to goal pacing, and ends with the strategic implication.
3. Exactly 3 "key moves" bullets (each under 12 words) — the strategic priorities the headline implies for next month.

Return compact JSON only.`;

  const userPrompt = `Client: ${input.clientName}
Window: ${input.windowLabel}

Outcome metrics (this month vs prior month):
${JSON.stringify(input.outcomeMetrics, null, 2)}

QTD goal pacing (vs quarterly NSM targets):
${JSON.stringify(input.pacingBadges, null, 2)}

Visibility metrics (GSC + Ahrefs):
${JSON.stringify(input.visibilityMetrics, null, 2)}

Top topic clusters by clicks:
${JSON.stringify(input.topClusters, null, 2)}

EEAT scan: ${input.eeatSummary ? JSON.stringify(input.eeatSummary) : "not run this period"}
Domain rating: ${input.ahrefsDomainRating ?? "not available"}
Content published this month: ${input.airtablePublished}
Asana tasks completed this month: ${input.asanaCompleted}

Return JSON: { "headline": "...", "narrative": "...", "keyMoves": ["...", "...", "..."] }`;

  try {
    const { result, provider } = await callAIJson(systemPrompt, userPrompt, { tier: "deep", maxOutputTokens: 800 });
    const headline = typeof result.headline === "string" && result.headline.trim() ? result.headline.trim() : null;
    const narrative = typeof result.narrative === "string" && result.narrative.trim() ? result.narrative.trim() : null;
    const keyMoves: string[] = Array.isArray(result.keyMoves)
      ? result.keyMoves.filter((m: any) => typeof m === "string" && m.trim().length > 0).slice(0, 3).map((m: string) => m.trim())
      : [];
    if (!headline || !narrative || keyMoves.length === 0) throw new Error("incomplete exec summary");
    return { headline, narrative, keyMoves, provider, fallbackTriggered: false };
  } catch {
    return { headline: null, narrative: null, keyMoves: [], provider: null, fallbackTriggered: true };
  }
}

// ─── Slide 3: Outcomes + QTD pacing (deep) ──────────────────────────────────

export async function narrateOutcomes(input: {
  windowLabel: string;
  outcomesMetrics: Array<{ label: string; current: string; delta?: string; isPositive?: boolean }>;
  pacingBadges: Array<{ label: string; current: string; goal: string; status: string; pacingPercent: string }>;
  outcomesBySource?: { headers: string[]; rows: (string | number)[][] };
}): Promise<CommentaryResult> {
  const systemPrompt = `You are a senior SEO account manager writing the business-outcomes commentary for a Monthly Report.
${VERTICAL_CONTEXT}
${BRAND_VOICE}

Write 3-5 sentences interpreting outcomes AND quarterly pacing together.
- Open with the most important outcome movement (calls, conversions, sessions — whichever drove the biggest story).
- Connect it to QTD pacing — e.g., "Sessions are 25% ahead of pace, but calls are flat — CRO is the next lever."
- Reference at least one specific number from the data.
- End with the strategic implication, not a wrap-up phrase.

Return compact JSON only.`;

  const userPrompt = `Window: ${input.windowLabel}

Outcome metrics:
${JSON.stringify(input.outcomesMetrics, null, 2)}

QTD goal pacing:
${JSON.stringify(input.pacingBadges, null, 2)}

${input.outcomesBySource ? `Outcomes by source (call tracker):\n${JSON.stringify(input.outcomesBySource, null, 2)}` : ""}

Return JSON: { "commentary": "..." }`;

  return narrateCommentary({ tier: "deep", maxTokens: 400, systemPrompt, userPrompt });
}

// ─── Slide 4: Organic visibility (balanced) ─────────────────────────────────

export async function narrateVisibility(input: {
  windowLabel: string;
  visibilityMetrics: Array<{ label: string; current: string; delta?: string; isPositive?: boolean }>;
  topClusters: Array<{ topic: string; queryCount: number; impressions: number; clicks: number }>;
}): Promise<CommentaryResult> {
  const systemPrompt = `You are a senior SEO account manager writing the organic visibility commentary for a Monthly Report.
${VERTICAL_CONTEXT}
${BRAND_VOICE}

Write 3-5 sentences interpreting visibility data.
- Focus on the impressions-vs-clicks gap (CTR signal) and which clusters are gaining/losing visibility.
- Reference one or two clusters by name.
- End with the strategic implication (where to focus next).

Return compact JSON only.`;

  const userPrompt = `Window: ${input.windowLabel}

Visibility metrics:
${JSON.stringify(input.visibilityMetrics, null, 2)}

Top topic clusters by impressions:
${JSON.stringify(input.topClusters, null, 2)}

Return JSON: { "commentary": "..." }`;

  return narrateCommentary({ tier: "balanced", maxTokens: 400, systemPrompt, userPrompt });
}

// ─── Slide 5: Per-cluster notes (fast, batched) ─────────────────────────────

export interface ClusterNoteInput {
  topic: string;
  queries: number;
  deltaQueries: string;
  clicks: number;
  deltaClicks: string;
  intent: string;
}

export interface ClusterNotesResult {
  notes: string[]; // one per input cluster, same order
  provider: string | null;
  fallbackTriggered: boolean;
}

export async function narrateClusterNotes(
  clusters: ClusterNoteInput[],
  windowLabel: string,
): Promise<ClusterNotesResult> {
  if (clusters.length === 0) {
    return { notes: [], provider: null, fallbackTriggered: false };
  }

  const systemPrompt = `You are a senior SEO account manager writing one short note per topic cluster for the Monthly Report's keyword movement slide.
${BRAND_VOICE}

Rules:
- One note per cluster, in the same order as input.
- Each note is a single sentence, 8-16 words.
- Lead with the movement (e.g., "Strong click growth driven by …" or "Click decline on Detox queries — refresh top landing pages").
- Don't repeat raw delta numbers — reference them with words like "ahead", "softened", "flat".

Return compact JSON only.`;

  const userPrompt = `Window: ${windowLabel}

Clusters:
${JSON.stringify(clusters, null, 2)}

Return JSON: { "notes": ["note for cluster 1", "note for cluster 2", ...] } — same count and order as input.`;

  try {
    const { result, provider } = await callAIJson(systemPrompt, userPrompt, { tier: "fast", maxOutputTokens: 800 });
    const notes: string[] = Array.isArray(result.notes)
      ? result.notes.map((n: any, i: number) => typeof n === "string" && n.trim().length > 0 ? n.trim() : "")
      : [];
    if (notes.length !== clusters.length) throw new Error("cluster note count mismatch");
    return { notes, provider, fallbackTriggered: false };
  } catch {
    return { notes: [], provider: null, fallbackTriggered: true };
  }
}

// ─── Slide 6: Intent misalignment detection + writeup (deep) ────────────────

export interface IntentMisalignmentInput {
  windowLabel: string;
  clientDomain: string;
  // Top query-page pairs from GSC, ordered by impressions × position-weight
  queryPagePairs: Array<{ query: string; url: string; clicks: number; impressions: number; position: number }>;
}

export interface IntentFinding {
  url: string;
  expected: string;
  observed: string;
  recommendation: string;
}

export interface IntentMisalignmentResult {
  findings: IntentFinding[];
  commentary: string | null;
  provider: string | null;
  fallbackTriggered: boolean;
}

export async function narrateIntentMisalignments(
  input: IntentMisalignmentInput,
): Promise<IntentMisalignmentResult> {
  if (input.queryPagePairs.length === 0) {
    return { findings: [], commentary: null, provider: null, fallbackTriggered: false };
  }

  const systemPrompt = `You are a senior SEO strategist auditing search-intent alignment for a behavioral health treatment center.
${VERTICAL_CONTEXT}
${BRAND_VOICE}

You are given query-to-landing-page pairs from Search Console. Your job is to:
1. Classify the EXPECTED intent of each landing page based on its URL path (informational / transactional / navigational / local / trust).
   URL-path heuristics:
   - /blog/, /resources/, /learn/, /articles/ → informational
   - /admissions/, /verify-insurance/, /contact/, /intake/ → transactional
   - /detox/, /residential/, /php/, /iop/, /programs/ → transactional (service)
   - /about/, /team/, /staff/, /reviewers/ → trust
   - root or /locations/* → navigational or local
2. Classify the OBSERVED intent of each query (what the searcher actually wants).
3. Identify the 3-5 most consequential MISALIGNMENTS — pages serving the wrong intent for the query landing on them.
4. For each misalignment write a one-sentence recommendation (redirect, refresh, build dedicated page, refine CTA, etc.).

Also write a 2-3 sentence summary commentary tying the findings together.

Skip pairs where intent already matches. Skip pairs with fewer than 5 clicks. Focus on the worst misalignments by impact (high-impression transactional queries landing on blog posts are top priority).

Return compact JSON only.`;

  const userPrompt = `Client domain: ${input.clientDomain}
Window: ${input.windowLabel}

Query → landing page pairs (top by impressions):
${JSON.stringify(input.queryPagePairs.slice(0, 25), null, 2)}

Return JSON:
{
  "findings": [
    {
      "url": "/the/landing/page",
      "expected": "Informational (blog page)",
      "observed": "Transactional — query 'detox near me' indicates ready-to-convert intent",
      "recommendation": "Redirect to /detox/ landing page or build dedicated near-me variant."
    }
  ],
  "commentary": "2-3 sentence summary of the misalignment patterns and the priority fix."
}

Return between 3 and 5 findings. If genuinely no significant misalignments exist, return an empty findings array and a positive-empty-state commentary.`;

  try {
    const { result, provider } = await callAIJson(systemPrompt, userPrompt, { tier: "deep", maxOutputTokens: 1200 });
    const findings: IntentFinding[] = Array.isArray(result.findings)
      ? result.findings
          .filter((f: any) => f && typeof f.url === "string" && typeof f.expected === "string" && typeof f.observed === "string" && typeof f.recommendation === "string")
          .slice(0, 5)
          .map((f: any) => ({
            url: f.url.trim(),
            expected: f.expected.trim(),
            observed: f.observed.trim(),
            recommendation: f.recommendation.trim(),
          }))
      : [];
    const commentary = typeof result.commentary === "string" && result.commentary.trim().length > 0
      ? result.commentary.trim()
      : null;
    // Findings can legitimately be empty (positive empty state). Commentary is required.
    if (!commentary) throw new Error("missing commentary");
    return { findings, commentary, provider, fallbackTriggered: false };
  } catch {
    return { findings: [], commentary: null, provider: null, fallbackTriggered: true };
  }
}

// ─── Slide 7: E-E-A-T (deep) ────────────────────────────────────────────────

export async function narrateEeat(input: {
  windowLabel: string;
  eeatSummary: {
    totalPagesScanned: number;
    pagesWithAuthorSchema: number;
    pagesWithReviewerInfo: number;
    pagesWithFaqs: number;
    pagesWithLastReviewed: number;
    pagesWithBylines: number;
    shellPagesDetected: number;
    topGapsByCategory: Array<{ category: string; pagesAffected: number; sampleUrls: string[] }>;
  } | null;
  ahrefsDomainRating?: string | null;
  brandedClickShare?: string | null;
}): Promise<CommentaryResult> {
  if (!input.eeatSummary) {
    return { commentary: null, provider: null, fallbackTriggered: false };
  }

  const systemPrompt = `You are a senior SEO strategist writing the E-E-A-T (Experience, Expertise, Authoritativeness, Trust) commentary for a YMYL behavioral health website.
${VERTICAL_CONTEXT}
${BRAND_VOICE}

Write 4-6 sentences:
- A one-sentence posture statement covering all four E-E-A-T dimensions in one read.
- Specific gaps tied to numbers from the scan (e.g., "Only 2 of 18 pages carry author schema; reviewer markup is absent.").
- A "top 3 priorities" list embedded in the prose, ordered by impact × effort — each priority specific enough that an SEO can act on it tomorrow.

Return compact JSON only.`;

  const userPrompt = `Window: ${input.windowLabel}

EEAT scan summary:
${JSON.stringify(input.eeatSummary, null, 2)}

Domain rating: ${input.ahrefsDomainRating ?? "not available"}
Branded click share: ${input.brandedClickShare ?? "not computed"}

Return JSON: { "commentary": "..." }`;

  return narrateCommentary({ tier: "deep", maxTokens: 600, systemPrompt, userPrompt });
}

// ─── Slide 8: Technical SEO (balanced) ──────────────────────────────────────

export async function narrateTechnical(input: {
  windowLabel: string;
  shellPagesDetected?: number | null;
  hasGscIndexCoverage: boolean;
}): Promise<CommentaryResult> {
  const systemPrompt = `You are a senior technical SEO writing the technical-health commentary for a Monthly Report.
${BRAND_VOICE}

Write 2-3 sentences. If GSC Index Coverage is not connected, name what's missing and what it would unlock. If shell pages were detected by the EEAT scanner, flag that as a JS-rendering risk and recommend pre-rendering or SSR for those pages.

Return compact JSON only.`;

  const userPrompt = `Window: ${input.windowLabel}
GSC Index Coverage connected: ${input.hasGscIndexCoverage}
Shell pages detected (JS-only rendering): ${input.shellPagesDetected ?? "not measured"}

Return JSON: { "commentary": "..." }`;

  return narrateCommentary({ tier: "balanced", maxTokens: 300, systemPrompt, userPrompt });
}

// ─── Slide 9: Page speed / CWV (fast) ───────────────────────────────────────

export async function narrateSpeed(input: {
  windowLabel: string;
  hasPageSpeedData: boolean;
}): Promise<CommentaryResult> {
  const systemPrompt = `You are a senior SEO writing the page-speed commentary for a Monthly Report.
${BRAND_VOICE}

Write 1-2 sentences. If PageSpeed Insights is not connected, name what's missing and say connecting it would let us track LCP / INP / CLS month-over-month. Don't speculate about current performance.

Return compact JSON only.`;

  const userPrompt = `Window: ${input.windowLabel}
PageSpeed Insights connected: ${input.hasPageSpeedData}

Return JSON: { "commentary": "..." }`;

  return narrateCommentary({ tier: "fast", maxTokens: 200, systemPrompt, userPrompt });
}

// ─── Slide 10: CRO & UX (balanced) ──────────────────────────────────────────

export async function narrateCro(input: {
  windowLabel: string;
  croMetrics: Array<{ label: string; current: string; delta?: string; isPositive?: boolean }>;
  landingPages?: { headers: string[]; rows: (string | number)[][] };
}): Promise<CommentaryResult> {
  const systemPrompt = `You are a senior SEO writing the CRO & UX commentary for a Monthly Report.
${VERTICAL_CONTEXT}
${BRAND_VOICE}

Write 3-4 sentences. Focus on conversion-rate trends and the highest-traffic-lowest-conversion landing pages (if visible in the data). Name a specific page or two and what to test (admissions CTA placement, VOB form prominence, hero clarity).

Return compact JSON only.`;

  const userPrompt = `Window: ${input.windowLabel}

CRO metrics:
${JSON.stringify(input.croMetrics, null, 2)}

${input.landingPages ? `Landing pages (organic):\n${JSON.stringify(input.landingPages, null, 2)}` : ""}

Return JSON: { "commentary": "..." }`;

  return narrateCommentary({ tier: "balanced", maxTokens: 400, systemPrompt, userPrompt });
}

// ─── Slide 11: Authority (balanced) ─────────────────────────────────────────

export async function narrateAuthority(input: {
  windowLabel: string;
  ahrefsSummary: Array<{ label: string; current: string }> | null;
}): Promise<CommentaryResult> {
  const systemPrompt = `You are a senior SEO writing the authority & internal-linking commentary for a Monthly Report.
${BRAND_VOICE}

Write 2-3 sentences. If Ahrefs data is present, interpret domain rating + referring domains as link-velocity signals. Note whether trust pages (Staff, Reviewers, About) are earning links. If Ahrefs is not connected, say what connecting it would unlock and stop.

Return compact JSON only.`;

  const userPrompt = `Window: ${input.windowLabel}

Ahrefs summary:
${input.ahrefsSummary ? JSON.stringify(input.ahrefsSummary, null, 2) : "Ahrefs not connected"}

Return JSON: { "commentary": "..." }`;

  return narrateCommentary({ tier: "balanced", maxTokens: 300, systemPrompt, userPrompt });
}

// ─── Slide 12: AI discoverability (balanced) ────────────────────────────────

export async function narrateAiDiscoverability(input: {
  windowLabel: string;
  eeatSummary: {
    totalPagesScanned: number;
    pagesWithFaqs: number;
    pages: Array<{ url: string; schemaBlockCount: number; schemaTypes: string[] }>;
  } | null;
}): Promise<CommentaryResult> {
  if (!input.eeatSummary) {
    return { commentary: null, provider: null, fallbackTriggered: false };
  }

  const pagesWithSchema = input.eeatSummary.pages.filter(p => p.schemaBlockCount > 0).length;
  const schemaCoverage = `${pagesWithSchema}/${input.eeatSummary.totalPagesScanned} pages carry structured data`;

  const systemPrompt = `You are a senior SEO writing the AI-discoverability commentary for a Monthly Report.
${BRAND_VOICE}

Write 2-3 sentences focused on what generative search (Google AI Overviews, ChatGPT, Perplexity) needs to extract from the site:
- Structured data coverage (Organization, FAQPage, MedicalEntity, Person/Author).
- Entity clarity (consistent name, NAP, credentials surfaced).
- Recommend the single highest-impact schema improvement.

Return compact JSON only.`;

  const userPrompt = `Window: ${input.windowLabel}
Schema coverage: ${schemaCoverage}
Pages with FAQ schema: ${input.eeatSummary.pagesWithFaqs}/${input.eeatSummary.totalPagesScanned}

Schema types observed (per page):
${JSON.stringify(input.eeatSummary.pages.slice(0, 12).map(p => ({ url: p.url, types: p.schemaTypes })), null, 2)}

Return JSON: { "commentary": "..." }`;

  return narrateCommentary({ tier: "balanced", maxTokens: 300, systemPrompt, userPrompt });
}

// ─── Slide 13: Content pipeline reasoning (fast, batched) ───────────────────

export interface PipelineRowInput {
  targetKeyword: string;
  url: string;
  creditCost: string;
  rawTask: string;
}

export interface PipelineReasoningResult {
  reasoning: string[]; // one per input row, same order
  provider: string | null;
  fallbackTriggered: boolean;
}

export async function narratePipelineReasoning(
  rows: PipelineRowInput[],
  windowLabel: string,
): Promise<PipelineReasoningResult> {
  if (rows.length === 0) {
    return { reasoning: [], provider: null, fallbackTriggered: false };
  }

  const systemPrompt = `You are a senior SEO account manager writing one-line reasoning blurbs for upcoming content items in a Monthly Report.
${VERTICAL_CONTEXT}
${BRAND_VOICE}

For each pipeline row, write one sentence (8-15 words) explaining WHY this piece is being produced. Connect to the business — admissions intent, cluster gap, refresh of underperformer, schema/EEAT gain, etc.

Return compact JSON only.`;

  const userPrompt = `Pipeline window: ${windowLabel}

Rows:
${JSON.stringify(rows, null, 2)}

Return JSON: { "reasoning": ["reason for row 1", "reason for row 2", ...] } — same count and order as input.`;

  try {
    const { result, provider } = await callAIJson(systemPrompt, userPrompt, { tier: "fast", maxOutputTokens: 800 });
    const reasoning: string[] = Array.isArray(result.reasoning)
      ? result.reasoning.map((r: any) => typeof r === "string" && r.trim().length > 0 ? r.trim() : "")
      : [];
    if (reasoning.length !== rows.length) throw new Error("pipeline reasoning count mismatch");
    return { reasoning, provider, fallbackTriggered: false };
  } catch {
    return { reasoning: [], provider: null, fallbackTriggered: true };
  }
}

// ─── Slide 14: Priorities rationale (fast, batched) ─────────────────────────

export interface PrioritiesRationaleResult {
  rationale: string[]; // one per bullet, same order
  commentary: string | null;
  provider: string | null;
  fallbackTriggered: boolean;
}

export async function narratePrioritiesRationale(
  bullets: string[],
  thisMonthSummary: Array<{ category: string; status: string; completed: number }>,
  windowLabel: string,
): Promise<PrioritiesRationaleResult> {
  if (bullets.length === 0) {
    return { rationale: [], commentary: null, provider: null, fallbackTriggered: false };
  }

  const systemPrompt = `You are a senior SEO account manager writing the strategic priorities slide for a Monthly Report.
${VERTICAL_CONTEXT}
${BRAND_VOICE}

For each next-month priority bullet, produce a refined version that:
- Stays under 18 words.
- Future tense ("Refresh top-performing service pages with EEAT signals…", "Publish two location-specific pages targeting …").
- References the business reason where possible (e.g., "to convert PHP/IOP queries currently landing on blog").

Also produce a single short commentary (2 sentences) that frames the priorities as a strategic theme.

Return compact JSON only.`;

  const userPrompt = `Window: ${windowLabel}

This-month progress by category:
${JSON.stringify(thisMonthSummary, null, 2)}

Raw next-month priority bullets (in AM-preferred order):
${JSON.stringify(bullets, null, 2)}

Return JSON:
{
  "rationale": ["refined bullet 1", "refined bullet 2", ...],
  "commentary": "2-sentence strategic frame for next month"
}

Same count and order as input bullets.`;

  try {
    const { result, provider } = await callAIJson(systemPrompt, userPrompt, { tier: "fast", maxOutputTokens: 800 });
    const rationale: string[] = Array.isArray(result.rationale)
      ? result.rationale.map((r: any) => typeof r === "string" && r.trim().length > 0 ? r.trim() : "")
      : [];
    const commentary = typeof result.commentary === "string" && result.commentary.trim().length > 0
      ? result.commentary.trim()
      : null;
    if (rationale.length !== bullets.length) throw new Error("priorities rationale count mismatch");
    return { rationale, commentary, provider, fallbackTriggered: false };
  } catch {
    return { rationale: [], commentary: null, provider: null, fallbackTriggered: true };
  }
}

// ─── Phase 3h: synthesize custom slide from AM brief (deep) ─────────────────

export type CustomSlideLayout = "stat_grid" | "prose_card" | "comparison_table" | "story";

export interface SynthesizeCustomSlideResult {
  layout: CustomSlideLayout;
  // Layout-specific fields. Only the fields relevant to `layout` are populated.
  headline?: string;
  narrative?: string;
  metrics?: Array<{ label: string; current: string; delta?: string; isPositive?: boolean }>;
  table?: { headers: string[]; rows: (string | number)[][] };
  sections?: Array<{ eyebrow: string; body: string }>;
  commentary?: string;
  provider: string | null;
  fallbackTriggered: boolean;
}

export async function synthesizeCustomSlide(opts: {
  title: string;
  brief: string;
  clientName: string;
  monthLabel: string;
}): Promise<SynthesizeCustomSlideResult> {
  const systemPrompt = `You are a senior SEO account manager building a custom slide for a Monthly Report. The AM gives you a free-form brief and a title; your job is to (1) choose the strongest layout for the content shape and (2) synthesize the brief into that layout.
${VERTICAL_CONTEXT}
${BRAND_VOICE}

Layout options:
- "stat_grid" — pick this when the brief is numbers-heavy. Surface 3-4 key stats. Each stat is { label, current, delta?, isPositive? }. Add a commentary callout (2-3 sentences) tying the numbers together.
- "prose_card" — pick this when the brief is an argument or explanation. Produce 2-4 sections, each { eyebrow, body }. The eyebrow is a 2-4 word label; the body is 1-3 sentences. Optionally add commentary at the bottom.
- "comparison_table" — pick this when the brief explicitly compares 2+ options or things. Produce a table { headers, rows }. 2-5 rows is ideal. Add commentary.
- "story" — pick this when the brief reads like a narrative (problem statement + situation + supporting facts). Produce headline (6-12 words), narrative (3-5 sentences), and 2-4 supporting facts as metrics.

Populate ONLY the fields relevant to the chosen layout. The AM edits everything afterwards, so polish the copy but don't over-think — translate raw AM notes into client-facing language with the brand voice.

Return compact JSON only.`;

  const userPrompt = `Client: ${opts.clientName}
Window: ${opts.monthLabel}

Title given by AM: ${opts.title}

Raw brief:
"""
${opts.brief}
"""

Pick a layout and return JSON in one of these shapes:

stat_grid:
{ "layout": "stat_grid", "metrics": [{"label":"...", "current":"...", "delta":"+12%", "isPositive": true}], "commentary": "..." }

prose_card:
{ "layout": "prose_card", "sections": [{"eyebrow":"WHY", "body":"..."}, {"eyebrow":"WHAT", "body":"..."}], "commentary": "..." }

comparison_table:
{ "layout": "comparison_table", "table": { "headers": ["Option", "Pros", "Cons"], "rows": [["A","...","..."]] }, "commentary": "..." }

story:
{ "layout": "story", "headline": "...", "narrative": "...", "metrics": [{"label":"...", "current":"..."}], "commentary": "..." }`;

  try {
    const { result, provider } = await callAIJson(systemPrompt, userPrompt, {
      tier: "deep",
      maxOutputTokens: 1200,
    });
    const layout = result.layout as CustomSlideLayout;
    if (!["stat_grid", "prose_card", "comparison_table", "story"].includes(layout)) {
      throw new Error(`invalid layout: ${layout}`);
    }

    const out: SynthesizeCustomSlideResult = {
      layout,
      provider,
      fallbackTriggered: false,
    };

    if (layout === "stat_grid") {
      out.metrics = Array.isArray(result.metrics)
        ? result.metrics
            .filter((m: any) => m && typeof m.label === "string" && typeof m.current === "string")
            .slice(0, 4)
            .map((m: any) => ({
              label: m.label.trim(),
              current: String(m.current).trim(),
              delta: typeof m.delta === "string" ? m.delta.trim() : undefined,
              isPositive: typeof m.isPositive === "boolean" ? m.isPositive : undefined,
            }))
        : [];
      if (typeof result.commentary === "string") out.commentary = result.commentary.trim();
      if ((out.metrics ?? []).length === 0 && !out.commentary) throw new Error("empty stat_grid output");
    } else if (layout === "prose_card") {
      out.sections = Array.isArray(result.sections)
        ? result.sections
            .filter((s: any) => s && typeof s.eyebrow === "string" && typeof s.body === "string")
            .slice(0, 4)
            .map((s: any) => ({ eyebrow: s.eyebrow.trim(), body: s.body.trim() }))
        : [];
      if (typeof result.commentary === "string") out.commentary = result.commentary.trim();
      if ((out.sections ?? []).length === 0) throw new Error("empty prose_card output");
    } else if (layout === "comparison_table") {
      const t = result.table;
      if (!t || !Array.isArray(t.headers) || !Array.isArray(t.rows)) {
        throw new Error("comparison_table missing table");
      }
      out.table = {
        headers: t.headers.map((h: any) => String(h)),
        rows: t.rows.map((row: any[]) => row.map((c: any) => String(c))),
      };
      if (typeof result.commentary === "string") out.commentary = result.commentary.trim();
      if (out.table.rows.length === 0) throw new Error("empty comparison_table rows");
    } else {
      // story
      out.headline = typeof result.headline === "string" ? result.headline.trim() : undefined;
      out.narrative = typeof result.narrative === "string" ? result.narrative.trim() : undefined;
      out.metrics = Array.isArray(result.metrics)
        ? result.metrics
            .filter((m: any) => m && typeof m.label === "string")
            .slice(0, 4)
            .map((m: any) => ({
              label: m.label.trim(),
              current: String(m.current ?? "—").trim(),
              delta: typeof m.delta === "string" ? m.delta.trim() : undefined,
              isPositive: typeof m.isPositive === "boolean" ? m.isPositive : undefined,
            }))
        : [];
      if (typeof result.commentary === "string") out.commentary = result.commentary.trim();
      if (!out.headline && !out.narrative) throw new Error("empty story output");
    }

    return out;
  } catch (err: any) {
    console.warn("[synthesizeCustomSlide] AI synthesis failed, returning fallback:", err?.message ?? err);
    // Fallback — drop the brief into a prose_card unchanged so the slide
    // still ships and the AM can edit it.
    return {
      layout: "prose_card",
      sections: [
        { eyebrow: "Brief", body: opts.brief.trim() },
      ],
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
