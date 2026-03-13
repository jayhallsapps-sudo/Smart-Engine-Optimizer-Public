/**
 * priorityEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Lightweight, explainable first-pass priority scoring for SmartEO findings.
 *
 * Design goals:
 *   • Transparent — every score is explained by factors + signals
 *   • Heuristic — works without real AI data; improves when data arrives
 *   • Non-blocking — informs AM judgment, never auto-commits or auto-rejects
 *   • Extensible — areas, signals, and weights are all explicit constants
 *
 * Scoring model:
 *   raw  = (impact × 2.0) + (urgency × 1.5) − (effort × 0.8)
 *   score = normalize(raw) to 0–10
 *
 * Factors:
 *   impact  1–5   Estimated SEO/business value if implemented
 *   urgency 1–3   Time-sensitivity (is something bleeding now?)
 *   effort  1–3   Implementation difficulty (higher = harder = lower priority)
 *
 * Priority buckets:
 *   ≥ 7.5 → "Must do now"
 *   ≥ 5.0 → "Should do next"
 *   ≥ 3.0 → "Worth doing later"
 *   <  3.0 → "Deprioritize for now"
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type PriorityBucket =
  | "must_do_now"
  | "should_do_next"
  | "worth_doing_later"
  | "deprioritize";

export interface PriorityMeta {
  bucket: PriorityBucket;
  /** Normalized 0–10 score for display and sorting. */
  score: number;
  /** Estimated SEO/business impact (1–5). */
  impact: number;
  /** Time-sensitivity (1–3). */
  urgency: number;
  /** Implementation effort required (1–3, higher = harder). */
  effort: number;
  /** Short human-readable rationale shown to AMs. */
  rationale: string;
  /** Detected text signals that shifted the score. */
  signals: string[];
}

// ─── Display constants ────────────────────────────────────────────────────────

export const BUCKET_LABELS: Record<PriorityBucket, string> = {
  must_do_now:       "Must do now",
  should_do_next:    "Should do next",
  worth_doing_later: "Worth doing later",
  deprioritize:      "Deprioritize for now",
};

/** Tailwind classes for the priority badge pill. */
export const BUCKET_BADGE_COLORS: Record<PriorityBucket, string> = {
  must_do_now:       "bg-[#C0392B]/10 text-[#C0392B] border-[#C0392B]/25",
  should_do_next:    "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-400/25",
  worth_doing_later: "bg-[#1B3A6B]/8 text-[#1B3A6B] dark:text-blue-300 border-[#1B3A6B]/20",
  deprioritize:      "bg-muted text-muted-foreground border-border/50",
};

/** Tailwind classes for the small dot indicator. */
export const BUCKET_DOT_COLORS: Record<PriorityBucket, string> = {
  must_do_now:       "bg-[#C0392B]",
  should_do_next:    "bg-amber-500",
  worth_doing_later: "bg-[#1B3A6B]",
  deprioritize:      "bg-muted-foreground/30",
};

// ─── Area baseline weights ─────────────────────────────────────────────────────
// Starting estimates before text signals adjust them.
// Represents typical strategic expectations per area type.

interface AreaWeights {
  baseImpact: number;   // 1–5
  baseUrgency: number;  // 1–3
  baseEffort: number;   // 1–3
  areaRationale: string;
}

const AREA_WEIGHTS: Record<string, AreaWeights> = {
  technical_infra: {
    baseImpact: 4, baseUrgency: 3, baseEffort: 2,
    areaRationale: "Technical infrastructure issues tend to be time-sensitive — crawl blocks and Core Web Vitals actively harm rankings.",
  },
  advanced_technical: {
    baseImpact: 3, baseUrgency: 2, baseEffort: 3,
    areaRationale: "Advanced technical work typically requires significant implementation effort.",
  },
  content_refresh: {
    baseImpact: 4, baseUrgency: 2, baseEffort: 2,
    areaRationale: "Content refresh has high SEO value and moderate effort — strong medium-term priority.",
  },
  new_content: {
    baseImpact: 3, baseUrgency: 1, baseEffort: 2,
    areaRationale: "New content is a medium-term investment — important but rarely urgent.",
  },
  cro_content: {
    baseImpact: 5, baseUrgency: 2, baseEffort: 1,
    areaRationale: "CRO improvements drive direct lead/revenue impact with relatively low execution effort.",
  },
  technical_content: {
    baseImpact: 3, baseUrgency: 2, baseEffort: 1,
    areaRationale: "On-page technical content fixes are typically quick wins with solid SEO upside.",
  },
  local_gbp: {
    baseImpact: 3, baseUrgency: 2, baseEffort: 1,
    areaRationale: "Local and GBP improvements are tactical and usually quick to implement.",
  },
  discoverability: {
    baseImpact: 2, baseUrgency: 1, baseEffort: 2,
    areaRationale: "Discoverability improvements are forward-looking with longer time-to-value.",
  },
};

const DEFAULT_AREA_WEIGHTS: AreaWeights = {
  baseImpact: 3, baseUrgency: 2, baseEffort: 2,
  areaRationale: "Standard strategic finding.",
};

// ─── Text signal detection ─────────────────────────────────────────────────────
// Keyword patterns in finding body text that adjust impact, urgency, or effort.
// Applied in order; each matching signal is noted for transparency.

interface TextSignal {
  pattern: RegExp;
  target: "urgency" | "impact" | "effort";
  delta: number;   // positive = up, negative = down
  label: string;   // shown in signals[] for AM visibility
}

const TEXT_SIGNALS: TextSignal[] = [
  // ── Urgency UP ──────────────────────────────────────────────────────────────
  { pattern: /\b(declin\w*|drop(?:ping)?|decreas\w*|fell\b|falling)\b/i,     target: "urgency", delta:  1,    label: "declining trend detected" },
  { pattern: /\b(broken|error|critical|blocked|failing|not (working|loading))\b/i, target: "urgency", delta: 1, label: "active issue" },
  { pattern: /crawl budget|soft 404|redirect chain/i,                         target: "urgency", delta:  1,    label: "crawl issue" },
  { pattern: /\blcp\b|core web vital|page speed|cls\b|fid\b|inp\b/i,         target: "urgency", delta:  1,    label: "Core Web Vitals" },
  { pattern: /not rendering|invisible to (search|googlebot)|js.render/i,      target: "urgency", delta:  1,    label: "rendering blocker" },
  { pattern: /\b(yoy|year.over.year|month.over.month|mom)\b.*declin/i,        target: "urgency", delta:  0.5,  label: "measurable decline" },

  // ── Urgency DOWN ────────────────────────────────────────────────────────────
  { pattern: /\b(opportunity|consider|explore|potential|future|longer.term)\b/i, target: "urgency", delta: -0.5, label: "exploratory" },
  { pattern: /standard monitoring|continue monitoring/i,                       target: "urgency", delta: -0.5,  label: "monitoring state" },
  { pattern: /no (blockers?|issues?) identified/i,                             target: "urgency", delta: -1,    label: "no active issue" },

  // ── Impact UP ───────────────────────────────────────────────────────────────
  { pattern: /\b(conversion|lead|call|revenue|admissions|insurance|intake)\b/i, target: "impact", delta:  1,   label: "conversion impact" },
  { pattern: /\b(high.intent|money page|primary service|top.performin)\b/i,    target: "impact", delta:  0.5,  label: "high-intent asset" },
  { pattern: /\b(ctr|click.through|organic (traffic|clicks|sessions|leads))\b/i, target: "impact", delta: 0.5, label: "traffic signal" },
  { pattern: /\b(featured snippet|position 0|ai overview|knowledge graph)\b/i, target: "impact", delta:  0.5,  label: "SERP feature opportunity" },

  // ── Impact DOWN ─────────────────────────────────────────────────────────────
  { pattern: /\b(minor|minimal|small|marginal|low.priority)\b/i,               target: "impact", delta: -1,    label: "low-impact signal" },
  { pattern: /\bno (blocker|issue|problem|concern)s? (identified|found)\b/i,   target: "impact", delta: -0.5,  label: "no material issue" },

  // ── Effort DOWN (easier / quick wins) ───────────────────────────────────────
  { pattern: /quick win|simple (fix|update|change|add)|easy (to|win)/i,        target: "effort", delta: -1,    label: "quick win" },
  { pattern: /\badd (a |an )?(schema|tag|cta|button|post|link)\b/i,            target: "effort", delta: -0.5,  label: "additive change" },
  { pattern: /update (title|meta|h1|alt text|redirect)/i,                      target: "effort", delta: -0.5,  label: "content-level fix" },
  { pattern: /noindex|robots\.txt|disallow/i,                                   target: "effort", delta: -0.5,  label: "config-level fix" },

  // ── Effort UP (harder) ──────────────────────────────────────────────────────
  { pattern: /\b(migration|rebuild|restructur|full (redesign|overhaul))\b/i,   target: "effort", delta:  1,    label: "major implementation" },
  { pattern: /\b(js.rend|javascript.render|server.side render|ssr)\b/i,        target: "effort", delta:  1,    label: "JS rendering complexity" },
  { pattern: /\b(log (analysis|file)|server log|log.based)\b/i,                target: "effort", delta:  0.5,  label: "log analysis required" },
  { pattern: /\b(international|hreflang|multi.region|geo.targeting)\b/i,       target: "effort", delta:  0.5,  label: "international SEO complexity" },
];

// ─── Scoring helpers ──────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Normalize raw score to 0–10. Raw range: [1.1, 13.7] */
function normalize(raw: number): number {
  const MIN_RAW = 1.1;
  const MAX_RAW = 13.7;
  const n = ((raw - MIN_RAW) / (MAX_RAW - MIN_RAW)) * 10;
  return Math.round(clamp(n, 0, 10) * 10) / 10;
}

function bucketFromScore(score: number): PriorityBucket {
  if (score >= 7.5) return "must_do_now";
  if (score >= 5.0) return "should_do_next";
  if (score >= 3.0) return "worth_doing_later";
  return "deprioritize";
}

function buildRationale(
  base: AreaWeights,
  bucket: PriorityBucket,
  impact: number,
  urgency: number,
  effort: number,
  signals: string[],
): string {
  const bucketStr = BUCKET_LABELS[bucket];
  const impactLabel  = impact  >= 4 ? "high impact"   : impact  === 3 ? "medium impact" : "lower impact";
  const urgencyLabel = urgency >= 3 ? "time-sensitive" : urgency === 2 ? "moderate urgency" : "lower urgency";
  const effortLabel  = effort  >= 3 ? "high effort"   : effort  === 2 ? "moderate effort"  : "low effort";

  let r = `${bucketStr}. ${base.areaRationale} This finding scores as ${impactLabel}, ${urgencyLabel}, ${effortLabel}`;
  if (signals.length > 0) {
    r += `. Key signals: ${signals.slice(0, 3).join("; ")}.`;
  } else {
    r += ".";
  }
  r += " This is a first-pass heuristic — use your judgment.";
  return r;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Score a single finding body against its strategy area.
 *
 * Returns a PriorityMeta object with bucket, score, and a human-readable
 * rationale. This is a transparent heuristic — all factors are visible
 * to the AM and can be questioned or overridden via the chat panel.
 *
 * @param areaId   - Strategy area identifier (e.g. "technical_infra")
 * @param body     - Finding text to analyze
 */
export function scoreFinding(areaId: string, body: string): PriorityMeta {
  const base = AREA_WEIGHTS[areaId] ?? DEFAULT_AREA_WEIGHTS;

  let impact  = base.baseImpact;
  let urgency = base.baseUrgency;
  let effort  = base.baseEffort;
  const signals: string[] = [];

  for (const sig of TEXT_SIGNALS) {
    if (sig.pattern.test(body)) {
      if (sig.target === "urgency") urgency = clamp(urgency + sig.delta, 1, 3);
      if (sig.target === "impact")  impact  = clamp(impact  + sig.delta, 1, 5);
      if (sig.target === "effort")  effort  = clamp(effort  + sig.delta, 1, 3);
      if (!signals.includes(sig.label)) signals.push(sig.label);
    }
  }

  impact  = clamp(Math.round(impact),  1, 5);
  urgency = clamp(Math.round(urgency), 1, 3);
  effort  = clamp(Math.round(effort),  1, 3);

  const raw    = impact * 2.0 + urgency * 1.5 - effort * 0.8;
  const score  = normalize(raw);
  const bucket = bucketFromScore(score);

  return {
    bucket,
    score,
    impact,
    urgency,
    effort,
    rationale: buildRationale(base, bucket, impact, urgency, effort, signals),
    signals,
  };
}

/** Sort findings (or any scored item) by descending priority score. */
export function byPriorityDesc<T extends { priority?: PriorityMeta }>(a: T, b: T): number {
  return (b.priority?.score ?? 0) - (a.priority?.score ?? 0);
}
