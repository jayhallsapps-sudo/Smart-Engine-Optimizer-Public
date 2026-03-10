import type { GapAnswer } from "@shared/schema";

export interface GapContext {
  sentimentContext?: string;
  businessChanges?: string;
  trackingNotes?: string;
  priorityContext?: string;
  blockers?: string;
  narrativeNotes?: string;
  competitorContext?: string;
  conversionContext?: string;
  rawAnswers: GapAnswer[];
  hasAnswers: boolean;
}

const QUESTION_CONTEXT_MAP: Record<string, keyof Omit<GapContext, "rawAnswers" | "hasAnswers">> = {
  sentiment_frustrated_root_cause: "sentimentContext",
  sentiment_concerned_blockers: "sentimentContext",
  sentiment_happy_testimonial_opportunity: "sentimentContext",
  sentiment_neutral_momentum: "sentimentContext",
  business_change_q: "businessChanges",
  business_change_recent: "businessChanges",
  business_change_expansion: "businessChanges",
  tracking_confidence: "trackingNotes",
  tracking_incomplete: "trackingNotes",
  tracking_anomaly: "trackingNotes",
  priority_alignment: "priorityContext",
  priority_urgency: "priorityContext",
  priority_focus: "priorityContext",
  blockers_q: "blockers",
  client_dependency: "blockers",
  approval_blocker: "blockers",
  narrative_volatility: "narrativeNotes",
  narrative_anomaly: "narrativeNotes",
  competitor_shift: "competitorContext",
  conversion_context: "conversionContext",
  lead_quality: "conversionContext",
};

export function buildGapContext(answers: GapAnswer[]): GapContext {
  const ctx: GapContext = {
    rawAnswers: answers,
    hasAnswers: answers.some(a => !a.skipped && a.value !== null && a.value !== ""),
  };

  for (const answer of answers) {
    if (answer.skipped || answer.value === null || answer.value === "") continue;

    const valueStr = Array.isArray(answer.value)
      ? answer.value.join(", ")
      : typeof answer.value === "boolean"
      ? answer.value ? "Yes" : "No"
      : String(answer.value);

    const contextKey = Object.keys(QUESTION_CONTEXT_MAP).find(k =>
      answer.questionId.startsWith(k)
    );

    if (contextKey) {
      const field = QUESTION_CONTEXT_MAP[contextKey];
      if (field) {
        ctx[field] = ctx[field] ? `${ctx[field]}; ${valueStr}` : valueStr;
      }
    } else {
      ctx.narrativeNotes = ctx.narrativeNotes ? `${ctx.narrativeNotes}; ${valueStr}` : valueStr;
    }
  }

  return ctx;
}

export function gapContextToString(ctx: GapContext): string {
  const lines: string[] = [];
  if (ctx.sentimentContext) lines.push(`Client Sentiment Context: ${ctx.sentimentContext}`);
  if (ctx.businessChanges) lines.push(`Business Changes: ${ctx.businessChanges}`);
  if (ctx.trackingNotes) lines.push(`Tracking Notes: ${ctx.trackingNotes}`);
  if (ctx.priorityContext) lines.push(`Priority Context: ${ctx.priorityContext}`);
  if (ctx.blockers) lines.push(`Blockers / Dependencies: ${ctx.blockers}`);
  if (ctx.narrativeNotes) lines.push(`Additional Context: ${ctx.narrativeNotes}`);
  if (ctx.competitorContext) lines.push(`Competitor Context: ${ctx.competitorContext}`);
  if (ctx.conversionContext) lines.push(`Conversion Context: ${ctx.conversionContext}`);
  return lines.join("\n");
}
