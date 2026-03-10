import type {
  GapQuestion,
  GapAnalysisResult,
  GapSourceCategory,
  GapQuestionType,
  AmInputs,
  Client,
} from "@shared/schema";
import { fetchStrategyBank, StrategyBankData } from "./notionClient";
import { fetchQssbData, QssbData } from "./qssbClient";

export interface AccountContext {
  client: Client;
  availableDataSources: string[];
  recentReports?: SavedReport[];
}

export interface GapQuestionTemplate extends Omit<GapQuestion, 'id'> {
  templateId: string;
  reportTypes: string[]; // ['biweekly', 'monthly', 'qbr_prep', 'qbr_full', 'mid_strategy']
  evaluator: (params: {
    reportType: string;
    amInputs: AmInputs;
    accountContext: AccountContext;
    seoHqContext: SeoHqContext;
  }) => boolean;
}

export interface SeoHqContext {
  strategyBank: StrategyBankData;
  qssb: QssbData;
}

const QUESTION_TEMPLATES: GapQuestionTemplate[] = [
  // --- SENTIMENT GAPS ---
  {
    templateId: "sentiment_frustrated_root_cause",
    prompt: "The client's sentiment is marked as 'Frustrated'. What is the primary source of their frustration (e.g., performance, communication, speed of implementation)?",
    type: "long_text",
    priorityScore: 90,
    rationale: "Addressing client frustration directly in the report narrative is critical for retention.",
    showRationaleToUser: true,
    sourceCategory: "sentiment_gap",
    reportTypes: ["biweekly", "monthly", "qbr_prep", "qbr_full"],
    evaluator: ({ amInputs }) => amInputs.clientSentiment === "Frustrated"
  },
  {
    templateId: "sentiment_concerned_blockers",
    prompt: "Client is 'Concerned'. Are there any specific external blockers (client-side or technical) that are fueling this concern?",
    type: "long_text",
    priorityScore: 85,
    rationale: "External blockers need to be highlighted as dependencies to manage expectations.",
    showRationaleToUser: true,
    sourceCategory: "sentiment_gap",
    reportTypes: ["biweekly", "monthly"],
    evaluator: ({ amInputs }) => amInputs.clientSentiment === "Concerned"
  },
  {
    templateId: "sentiment_happy_testimonial_opportunity",
    prompt: "Client is 'Happy'. Is this a good time to request a testimonial or case study?",
    type: "boolean",
    priorityScore: 40,
    rationale: "Capitalize on positive sentiment for marketing proof.",
    showRationaleToUser: false,
    sourceCategory: "sentiment_gap",
    reportTypes: ["qbr_full", "monthly"],
    evaluator: ({ amInputs }) => amInputs.clientSentiment === "Happy"
  },

  // --- BUSINESS CONTEXT GAPS ---
  {
    templateId: "business_conversions_drop_context",
    prompt: "We see a significant drop in organic conversions. Has there been any change in how the client tracks leads or any known seasonal shifts?",
    type: "long_text",
    priorityScore: 95,
    rationale: "Performance drops without context look like SEO failure. Business context can explain anomalies.",
    showRationaleToUser: true,
    sourceCategory: "business_context_gap",
    reportTypes: ["monthly", "qbr_prep", "qbr_full"],
    evaluator: ({ amInputs, accountContext }) => {
      const thoughts = amInputs.amThoughts.toLowerCase();
      return thoughts.includes("drop") || thoughts.includes("decrease") || thoughts.includes("down") || thoughts.includes("lower");
    }
  },
  {
    templateId: "business_new_services",
    prompt: "Are there any new services or programs the client has launched that aren't yet reflected in their SEO content or site structure?",
    type: "boolean",
    priorityScore: 70,
    rationale: "Newly launched services need content coverage to rank and drive qualified admissions traffic.",
    showRationaleToUser: true,
    sourceCategory: "business_context_gap",
    reportTypes: ["qbr_full", "mid_strategy"],
    evaluator: ({ amInputs }) => {
      const t = (amInputs.amThoughts + " " + amInputs.priorityChecks).toLowerCase();
      return t.includes("new program") || t.includes("new service") || t.includes("launch") || t.includes("opening") || t.includes("expansion");
    }
  },
  {
    templateId: "business_competitor_shift",
    prompt: "Have you noticed new competitors showing up in organic results for this client's key treatment programs or service areas?",
    type: "short_text",
    placeholder: "e.g. American Addiction Centers is now ranking #2 for 'detox near me' in our client's market",
    priorityScore: 60,
    rationale: "Tracking emerging competitors helps us adjust keyword and content strategy proactively.",
    showRationaleToUser: false,
    sourceCategory: "business_context_gap",
    reportTypes: ["mid_strategy", "qbr_full"],
    evaluator: ({ amInputs }) => {
      const t = amInputs.amThoughts.toLowerCase();
      return t.includes("competitor") || t.includes("competing") || t.includes("outranked") || t.includes("losing position");
    }
  },
  {
    templateId: "business_budget_changes",
    prompt: "Has the client mentioned any changes to their content budget or marketing priorities for the next quarter?",
    type: "long_text",
    placeholder: "e.g. Reducing spend on paid media, shifting budget toward SEO and content",
    priorityScore: 80,
    rationale: "Budget shifts affect what we can realistically commit to in the QBR planning section.",
    showRationaleToUser: false,
    sourceCategory: "business_context_gap",
    reportTypes: ["qbr_full", "qbr_prep"],
    evaluator: ({ amInputs }) => {
      const t = (amInputs.amThoughts + " " + amInputs.priorityChecks).toLowerCase();
      return t.includes("budget") || t.includes("spend") || t.includes("cost") || t.includes("reduce") || t.includes("increase scope");
    }
  },

  // --- MISSING DATA GAPS ---
  {
    templateId: "missing_gsc_access",
    prompt: "GSC data appears to be missing or disconnected. Have we requested updated access from the client?",
    type: "boolean",
    priorityScore: 100,
    rationale: "Search Console is our primary source for proof of work.",
    showRationaleToUser: true,
    sourceCategory: "missing_data",
    reportTypes: ["biweekly", "monthly", "qbr_prep"],
    evaluator: ({ accountContext }) => !accountContext.availableDataSources.includes("google_search_console")
  },
  {
    templateId: "missing_call_tracking",
    prompt: "No call tracking (CallRail/CTM) is connected. How are we currently validating lead quality for this period?",
    type: "long_text",
    priorityScore: 80,
    rationale: "Lead validation is the 'money' part of the report. If automated tracking is off, manual context is required.",
    showRationaleToUser: true,
    sourceCategory: "missing_data",
    reportTypes: ["monthly", "qbr_prep", "qbr_full"],
    evaluator: ({ accountContext }) => 
      !accountContext.availableDataSources.includes("callrail") && 
      !accountContext.availableDataSources.includes("call_tracking_metrics")
  },
  {
    templateId: "missing_ga4_setup",
    prompt: "GA4 data is missing. Are we using an alternative analytics platform, or is there a tracking outage?",
    type: "long_text",
    priorityScore: 95,
    rationale: "Traffic data is foundational for all reporting.",
    showRationaleToUser: true,
    sourceCategory: "missing_data",
    reportTypes: ["monthly", "qbr_prep", "qbr_full"],
    evaluator: ({ accountContext }) => !accountContext.availableDataSources.includes("google_analytics_4")
  },
  {
    templateId: "missing_ahrefs_data",
    prompt: "Ahrefs API is not returning data for this client. Is the project URL configured correctly?",
    type: "boolean",
    priorityScore: 60,
    rationale: "Backlink and ranking data adds depth to our technical reporting.",
    showRationaleToUser: false,
    sourceCategory: "missing_data",
    reportTypes: ["monthly", "qbr_prep", "mid_strategy"],
    evaluator: ({ accountContext }) => !accountContext.availableDataSources.includes("ahrefs")
  },

  // --- SEO HQ ALIGNMENT GAPS (Notion/QSSB Context) ---
  {
    templateId: "hq_qssb_unaddressed_insights",
    prompt: "The QSSB contains specific client questions that haven't been addressed in your thoughts. Which of these will you cover in the meeting?",
    type: "multi_select",
    priorityScore: 75,
    rationale: "Closing the loop on previously asked questions is an SEO HQ standard.",
    showRationaleToUser: true,
    sourceCategory: "SEO_HQ_alignment_gap",
    reportTypes: ["biweekly", "qbr_prep"],
    evaluator: ({ seoHqContext, amInputs }) => {
      const insights = seoHqContext.qssb.clientInsights;
      if (insights.length === 0) return false;
      const thoughts = amInputs.amThoughts.toLowerCase();
      // Heuristic: check if keywords from insights appear in thoughts
      return !insights.some(insight => {
        const words = insight.toLowerCase().split(' ').filter(w => w.length > 3).slice(0, 3);
        return words.length > 0 && words.every(w => thoughts.includes(w));
      });
    }
  },
  {
    templateId: "hq_strategy_bank_upsell",
    prompt: "The Strategy Bank suggests relevant services for this client type. Should we include any of these as recommended next steps?",
    type: "multi_select",
    priorityScore: 65,
    rationale: "Aligning with our internal strategy bank ensures we're offering the best solutions.",
    showRationaleToUser: false,
    sourceCategory: "SEO_HQ_alignment_gap",
    reportTypes: ["qbr_full", "mid_strategy", "monthly"],
    evaluator: ({ seoHqContext }) => seoHqContext.strategyBank.entries.length > 0
  },
  // hq_qssb_additional_opportunities removed — this question appeared for QSSB clients
  // even when the AM had no action to report, causing confusion. QSSB follow-up is
  // handled manually in the Partnership section, not via the gap flow.

  // --- REPORT NARRATIVE GAPS ---
  {
    templateId: "narrative_no_wins",
    prompt: "Your thoughts don't explicitly mention any 'wins' or positive momentum. Can you identify one key positive highlight for this period?",
    type: "long_text",
    priorityScore: 85,
    rationale: "Even in tough months, identifying momentum is key for maintaining confidence.",
    showRationaleToUser: true,
    sourceCategory: "report_narrative_gap",
    reportTypes: ["biweekly", "monthly"],
    evaluator: ({ amInputs }) => {
      const thoughts = amInputs.amThoughts.toLowerCase();
      const winKeywords = ["win", "success", "increase", "positive", "growth", "improved", "achievement", "momentum", "better"];
      return !winKeywords.some(k => thoughts.includes(k));
    }
  },
  {
    templateId: "narrative_no_action_plan",
    prompt: "The priorities list doesn't include clear 'next steps' for the client to review. What are the top 3 action items?",
    type: "long_text",
    priorityScore: 80,
    rationale: "Reports must be actionable, not just data dumps.",
    showRationaleToUser: true,
    sourceCategory: "report_narrative_gap",
    reportTypes: ["biweekly", "monthly", "qbr_prep"],
    evaluator: ({ amInputs }) => {
      const priorities = amInputs.priorityChecks.toLowerCase();
      return priorities.length < 20 || (!priorities.includes("step") && !priorities.includes("next") && !priorities.includes("plan"));
    }
  },

  // --- PRIORITY GAPS ---
  {
    templateId: "priority_alignment_check",
    prompt: "The priority checks you listed don't seem to match the 'Money Pages' configured for this client. Should we focus more on high-value pages?",
    type: "boolean",
    priorityScore: 80,
    rationale: "Ensuring reports focus on the pages that drive business value.",
    showRationaleToUser: true,
    sourceCategory: "priority_gap",
    reportTypes: ["monthly", "qbr_prep", "qbr_full"],
    evaluator: ({ amInputs, accountContext }) => {
      const moneyPages = accountContext.client.moneyPages || [];
      if (moneyPages.length === 0) return false;
      const priorities = amInputs.priorityChecks.toLowerCase();
      return !moneyPages.some(page => priorities.includes(page.toLowerCase()));
    }
  },

  // --- TRACKING CONFIDENCE GAPS ---
  {
    templateId: "tracking_anomaly_narrative",
    prompt: "We've detected a potential tracking anomaly in the data. How would you like to explain this to the client?",
    type: "long_text",
    placeholder: "Explain the discrepancy or mention we are investigating...",
    priorityScore: 90,
    rationale: "Proactively addressing data discrepancies builds trust.",
    showRationaleToUser: true,
    sourceCategory: "tracking_confidence_gap",
    reportTypes: ["monthly", "qbr_prep"],
    evaluator: ({ amInputs }) => {
      const thoughts = amInputs.amThoughts.toLowerCase();
      return thoughts.includes("anomaly") || thoughts.includes("discrepancy") || thoughts.includes("weird") || thoughts.includes("strange");
    }
  },

  // --- BLOCKER / DEPENDENCY GAPS ---
  {
    templateId: "blocker_client_delay",
    prompt: "Are there outstanding content approvals or technical implementations that the client has delayed?",
    type: "boolean",
    priorityScore: 85,
    rationale: "Documenting client-side delays protects our performance narrative and sets accurate expectations.",
    showRationaleToUser: true,
    sourceCategory: "blocker_dependency_gap",
    reportTypes: ["biweekly", "monthly"],
    evaluator: ({ amInputs }) => {
      const t = (amInputs.amThoughts + " " + amInputs.priorityChecks).toLowerCase();
      return t.includes("approval") || t.includes("client hasn't") || t.includes("waiting on client") || t.includes("pending review") || t.includes("no response");
    }
  },
  {
    templateId: "blocker_resource_gap",
    prompt: "Do we have the dev or content access needed to complete the priorities listed for next quarter?",
    type: "boolean",
    priorityScore: 75,
    rationale: "Resource access constraints need to be called out to avoid overpromising in the QBR.",
    showRationaleToUser: false,
    sourceCategory: "blocker_dependency_gap",
    reportTypes: ["monthly", "qbr_prep", "mid_strategy"],
    evaluator: ({ amInputs }) => {
      const t = (amInputs.amThoughts + " " + amInputs.priorityChecks).toLowerCase();
      return t.includes("dev access") || t.includes("need access") || t.includes("can't publish") || t.includes("no cms") || t.includes("waiting on dev");
    }
  },

  // --- MID-STRATEGY SPECIFIC ---
  {
    templateId: "strategy_defensibility",
    prompt: "How defensible is our current keyword strategy against major algorithmic shifts we've seen recently?",
    type: "long_text",
    priorityScore: 90,
    rationale: "Strategic defensibility is a core requirement for Mid-Strategy reports.",
    showRationaleToUser: false,
    sourceCategory: "SEO_HQ_alignment_gap",
    reportTypes: ["mid_strategy"],
    evaluator: () => true
  },
  {
    templateId: "strategy_future_moat",
    prompt: "What is the 'moat' we are building for this client that competitors can't easily replicate?",
    type: "long_text",
    priorityScore: 85,
    rationale: "Long-term strategy requires identifying unique competitive advantages.",
    showRationaleToUser: false,
    sourceCategory: "business_context_gap",
    reportTypes: ["mid_strategy"],
    evaluator: () => true
  }
];

// Add 60 more templates to hit the "80+" requirement...
// I will generate them in batches to maintain quality and variety.

const ADDITIONAL_TEMPLATES: GapQuestionTemplate[] = [
  // Missing Data
  {
    templateId: "missing_nimbata",
    prompt: "Nimbata is configured for this client but no data is being pulled. Is the API key still valid?",
    type: "boolean",
    priorityScore: 60,
    rationale: "Ensuring all lead sources are accounted for.",
    sourceCategory: "missing_data",
    reportTypes: ["monthly"],
    evaluator: ({ accountContext }) => !!accountContext.client.nimbataAccountId && !accountContext.availableDataSources.includes("nimbata"),
    showRationaleToUser: false
  },
  {
    templateId: "missing_gbp_data",
    prompt: "Google Business Profile data is missing. Is the location name or profile URL correct in client settings?",
    type: "boolean",
    priorityScore: 70,
    rationale: "Local SEO impact needs GBP data to be visible.",
    sourceCategory: "missing_data",
    reportTypes: ["monthly", "qbr_prep"],
    evaluator: ({ accountContext }) => !accountContext.availableDataSources.includes("google_business_profile"),
    showRationaleToUser: true
  },
  // Source Conflict
  {
    templateId: "conflict_ga4_gsc_clicks",
    prompt: "There is a >20% discrepancy between GSC clicks and GA4 organic sessions. Any known tracking issues?",
    type: "long_text",
    priorityScore: 80,
    rationale: "Source conflicts undermine report credibility if left unexplained.",
    sourceCategory: "source_conflict",
    reportTypes: ["monthly", "qbr_prep"],
    evaluator: ({ amInputs }) => amInputs.amThoughts.toLowerCase().includes("discrepancy") || amInputs.amThoughts.toLowerCase().includes("mismatch"),
    showRationaleToUser: true
  },
  // Sentiment
  {
    templateId: "sentiment_neutral_engagement",
    prompt: "Client sentiment is 'Neutral'. Have they been responsive to our recent emails and requests?",
    type: "boolean",
    priorityScore: 50,
    rationale: "Neutrality can often be a precursor to churn if engagement is low.",
    sourceCategory: "sentiment_gap",
    reportTypes: ["biweekly"],
    evaluator: ({ amInputs }) => amInputs.clientSentiment === "Neutral",
    showRationaleToUser: false
  },
  // Narrative
  {
    templateId: "narrative_too_technical",
    prompt: "The AM thoughts are very technical. Should we add a high-level executive summary for the client's leadership?",
    type: "boolean",
    priorityScore: 70,
    rationale: "Ensuring the report is readable for non-technical stakeholders.",
    sourceCategory: "report_narrative_gap",
    reportTypes: ["qbr_full", "monthly"],
    evaluator: ({ amInputs }) => {
      const t = amInputs.amThoughts.toLowerCase();
      return t.includes("canonical") || t.includes("indexation") || t.includes("schema") || t.includes("rendering");
    },
    showRationaleToUser: false
  },
  // Priority
  {
    templateId: "priority_low_impact_tasks",
    prompt: "The priority checks focus heavily on low-impact technical fixes. Can we shift focus to high-impact content or backlinks?",
    type: "boolean",
    priorityScore: 75,
    rationale: "Maximizing ROI for the client's budget.",
    sourceCategory: "priority_gap",
    reportTypes: ["monthly", "qbr_prep"],
    evaluator: ({ amInputs }) => {
      const p = amInputs.priorityChecks.toLowerCase();
      return p.includes("meta") || p.includes("alt text") || p.includes("broken link");
    },
    showRationaleToUser: true
  },
  // Blocker — only fire when AM explicitly mentions deadlines missed
  {
    templateId: "blocker_client_delay_specific",
    prompt: "Which specific deliverable is blocked, and what do you need from the client to unblock it?",
    type: "short_text",
    placeholder: "e.g. Content approval for 3 service pages pending since Jan 15",
    priorityScore: 85,
    rationale: "Specific blocker details protect our performance narrative and create a paper trail.",
    sourceCategory: "blocker_dependency_gap",
    reportTypes: ["biweekly", "monthly", "qbr_prep"],
    evaluator: ({ amInputs }) => {
      const t = (amInputs.amThoughts + " " + amInputs.priorityChecks).toLowerCase();
      return t.includes("waiting") || t.includes("blocked") || t.includes("pending") || t.includes("delayed") || t.includes("client needs to");
    },
    showRationaleToUser: true
  },

  // ── QBR PREP SPECIFIC ────────────────────────────────────────────────
  {
    templateId: "qbr_prep_call_volume_context",
    prompt: "No call tracking data is connected. Can you provide the current call volume from your call tracking platform so we can validate admissions intent?",
    type: "short_text",
    placeholder: "e.g. 42 calls in Q1, tracked via CallRail",
    priorityScore: 95,
    rationale: "Call volume is the primary lead proxy for behavioral health clients. Without it, the primary goal row in Section 1 can't be accurately populated.",
    sourceCategory: "missing_data",
    reportTypes: ["qbr_prep"],
    evaluator: ({ accountContext }) =>
      !accountContext.availableDataSources.includes("callrail") &&
      !accountContext.availableDataSources.includes("call_tracking_metrics") &&
      !accountContext.availableDataSources.includes("nimbata"),
    showRationaleToUser: true
  },
  {
    templateId: "qbr_prep_nsm_missing",
    prompt: "NSM Tracker data isn't available for this client. What are their current session and admit goals for this quarter?",
    type: "long_text",
    placeholder: "e.g. Q2 goal: 160 admits, 8,000 organic sessions",
    priorityScore: 92,
    rationale: "Without NSM goals, Section 1 Goal Planning will only show placeholder data. This is a required field for QBR Prep.",
    sourceCategory: "missing_data",
    reportTypes: ["qbr_prep"],
    evaluator: ({ accountContext }) => !accountContext.availableDataSources.includes("nsm_tracker"),
    showRationaleToUser: true
  },
  {
    templateId: "qbr_prep_top_performing_page_context",
    prompt: "Do you have any context on why a specific page or section is performing particularly well or poorly right now?",
    type: "long_text",
    placeholder: "e.g. The detox page jumped after we added schema markup; the residential page dipped after a redesign",
    priorityScore: 75,
    rationale: "AM context on traffic anomalies helps explain Section 3 data and improves narrative quality.",
    sourceCategory: "report_narrative_gap",
    reportTypes: ["qbr_prep"],
    evaluator: ({ amInputs }) => {
      const t = amInputs.amThoughts.toLowerCase();
      return !t.includes("because") && !t.includes("due to") && !t.includes("after") && !t.includes("redesign") && !t.includes("launch");
    },
    showRationaleToUser: true
  },
  {
    templateId: "qbr_prep_next_quarter_priority",
    prompt: "What is the client's top business priority going into the planning quarter — census, new programs, market expansion, or something else?",
    type: "single_select",
    options: ["Census / admissions volume", "New program launch", "Market / geo expansion", "Brand authority", "Reputation / trust building", "Cost efficiency"],
    priorityScore: 70,
    rationale: "Knowing the client's top priority shapes which Section 6 recommendations are listed first.",
    sourceCategory: "business_context_gap",
    reportTypes: ["qbr_prep"],
    evaluator: ({ amInputs }) => {
      const t = amInputs.priorityChecks.toLowerCase();
      return !t.includes("census") && !t.includes("new program") && !t.includes("expansion") && !t.includes("brand") && !t.includes("priority");
    },
    showRationaleToUser: false
  },
  {
    templateId: "qbr_prep_screamingfrog_missing",
    prompt: "No Screaming Frog crawl data is available. Are there known technical issues (crawl errors, indexation blocks, redirect chains) we should mention in the Technical Diagnosis section?",
    type: "long_text",
    placeholder: "e.g. Several 404s on old service pages, redirect chain on homepage, robots.txt blocking /blog/",
    priorityScore: 68,
    rationale: "Section 5 Tier Diagnosis relies on crawl data. Missing crawl data means the tier and technical issues may be under-reported.",
    sourceCategory: "missing_data",
    reportTypes: ["qbr_prep"],
    evaluator: ({ accountContext }) => !accountContext.availableDataSources.includes("screaming_frog"),
    showRationaleToUser: true
  },
  {
    templateId: "qbr_prep_sentiment_frustrated_prep",
    prompt: "Client is frustrated. Before the QBR, what's the one thing you'd want to proactively acknowledge or address in the report?",
    type: "long_text",
    placeholder: "e.g. Slow start to the quarter, but we have a plan — focusing the QBR on momentum and next steps",
    priorityScore: 88,
    rationale: "Proactively framing a frustration narrative in a QBR prevents the meeting from becoming reactive.",
    sourceCategory: "sentiment_gap",
    reportTypes: ["qbr_prep"],
    evaluator: ({ amInputs }) => amInputs.clientSentiment === "Frustrated" || amInputs.clientSentiment === "Concerned",
    showRationaleToUser: true
  },
];

const ALL_TEMPLATES = [...QUESTION_TEMPLATES, ...ADDITIONAL_TEMPLATES];

export type SeoHqOverallStatus = "loaded" | "partial" | "unavailable" | "timed_out";

export interface SeoHqLoadStatus {
  strategyBank: "loaded" | "failed";
  qssb: "loaded" | "failed";
  overallStatus: SeoHqOverallStatus;
}

const SEO_HQ_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`SEO HQ context load timed out after ${ms}ms`)), ms)
    ),
  ]);
}

// Helper to load SEO HQ Context with timeout + status tracking
export async function loadSEOHQContext(): Promise<{ context: SeoHqContext; status: SeoHqLoadStatus }> {
  let sbStatus: "loaded" | "failed" = "loaded";
  let qssbStatus: "loaded" | "failed" = "loaded";

  let strategyBankResult: any;
  let qssbResult: any;

  try {
    [strategyBankResult, qssbResult] = await withTimeout(
      Promise.all([
        fetchStrategyBank().catch(e => { sbStatus = "failed"; return { entries: [], fetchedAt: "" }; }),
        fetchQssbData().catch(e => { qssbStatus = "failed"; return { clientInsights: [], additionalOpportunities: [], fetchedAt: "" }; }),
      ]),
      SEO_HQ_TIMEOUT_MS
    );
  } catch (timeoutErr) {
    sbStatus = "failed";
    qssbStatus = "failed";
    strategyBankResult = { entries: [], fetchedAt: "" };
    qssbResult = { clientInsights: [], additionalOpportunities: [], fetchedAt: "" };
    const timedOut = String(timeoutErr).includes("timed out");
    const status: SeoHqLoadStatus = {
      strategyBank: "failed",
      qssb: "failed",
      overallStatus: timedOut ? "timed_out" : "unavailable",
    };
    console.log(`[GapAnalysis] SEO HQ context status: ${JSON.stringify(status)}`);
    return { context: { strategyBank: strategyBankResult, qssb: qssbResult }, status };
  }

  const overallStatus: SeoHqOverallStatus =
    sbStatus === "loaded" && qssbStatus === "loaded" ? "loaded" :
    sbStatus === "failed" && qssbStatus === "failed" ? "unavailable" :
    "partial";

  const status: SeoHqLoadStatus = { strategyBank: sbStatus, qssb: qssbStatus, overallStatus };
  console.log(`[GapAnalysis] SEO HQ context status: ${JSON.stringify(status)}`);

  return { context: { strategyBank: strategyBankResult, qssb: qssbResult }, status };
}

/**
 * Main Engine Function
 */
export async function analyzeReportGaps(
  reportType: string,
  amInputs: AmInputs,
  accountContext: AccountContext,
  seoHqContext: SeoHqContext
): Promise<GapAnalysisResult> {
  const selectedQuestions: GapQuestion[] = [];
  const seoHqChecksApplied: string[] = [];

  // Filter and evaluate templates
  const relevantTemplates = ALL_TEMPLATES.filter(t => t.reportTypes.includes(reportType));

  for (const template of relevantTemplates) {
    try {
      if (template.evaluator({ reportType, amInputs, accountContext, seoHqContext })) {
        selectedQuestions.push({
          id: template.templateId,
          prompt: template.prompt,
          type: template.type,
          options: template.options,
          placeholder: template.placeholder,
          priorityScore: template.priorityScore,
          rationale: template.rationale,
          showRationaleToUser: template.showRationaleToUser,
          sourceCategory: template.sourceCategory,
          sourceReference: null
        });

        if (template.sourceCategory === "SEO_HQ_alignment_gap") {
          seoHqChecksApplied.push(template.templateId);
        }
      }
    } catch (err) {
      console.error(`Error evaluating template ${template.templateId}:`, err);
    }
  }

  // Sort by priority score descending
  selectedQuestions.sort((a, b) => b.priorityScore - a.priorityScore);

  // Hard maximum of 5 questions to avoid session sprawl
  const finalQuestions = selectedQuestions.slice(0, 5);

  // Calculate confidence score (simple heuristic)
  // Base 100, -10 per high priority question found
  let confidenceScore = 100;
  finalQuestions.forEach(q => {
    if (q.priorityScore >= 90) confidenceScore -= 15;
    else if (q.priorityScore >= 80) confidenceScore -= 10;
    else confidenceScore -= 5;
  });
  confidenceScore = Math.max(0, confidenceScore);

  return {
    shouldAskQuestions: finalQuestions.length > 0,
    questions: finalQuestions,
    confidenceScore,
    seoHqChecksApplied,
    notes: [
      `Evaluated ${relevantTemplates.length} rule templates.`,
      `Identified ${finalQuestions.length} clarifying items.`
    ]
  };
}
