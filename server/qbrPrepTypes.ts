import type { GapContext } from "./gapAnswerContext";

export interface QbrPrepMeta {
  site: string;
  domain: string;
  primaryLocation: string;
  programPositioning: string;
  analysisWindow: string;
  analysisWindowStart: string;
  analysisWindowEnd: string;
  planningQuarter: string;
  planningYear: number;
  generatedOn: string;
}

export interface GoalRow {
  goalType: string;
  goal: string;
  measurementSource: string;
  goalShift: string;
  reason: string;
}

export interface Section1Goals {
  rows: GoalRow[];
}

export interface ConvertingPageRow {
  type: string;
  page: string;
  conversionSource: string;
  notes: string;
  dataSource?: string;
}

export interface ConversionPatternRow {
  pattern: string;
  whyItMatters: string;
  evidence: string;
}

export interface ConvertingSourceRow {
  source: string;
  whatsConverting: string;
  notes: string;
  dataSource?: string;
}

export interface Section2Conversions {
  topConvertingPages: ConvertingPageRow[];
  topConversionPatterns: ConversionPatternRow[];
  topConvertingSources: ConvertingSourceRow[];
  trackingDisclaimer?: string;
}

export interface TrafficTopicRow {
  topic: string;
  exampleQueries: string;
  connectionToAdmits: string;
  insight: string;
  dataSource?: string;
  queryCount?: number;
  queryCountDelta?: string;
  impressions?: number;
  impressionsDelta?: string;
  pageCount?: number;
}

export interface TrafficPageRow {
  page: string;
  clicks: string;
  clicksDelta?: string;
  impressions?: string;
  impressionsDelta?: string;
  queries?: string;
  queriesDelta?: string;
  ctr: string;
  connectionToAdmits: string;
  insight: string;
  dataSource?: string;
}

export interface Section3Traffic {
  topTrafficTopics: TrafficTopicRow[];
  topTrafficPages: TrafficPageRow[];
}

export interface ServiceRow {
  service: string;
  examplePage: string;
  seoScore?: number;
  notes?: string;
}

export interface Section4Services {
  services: ServiceRow[];
}

export interface TierScorecardEntry {
  tierNumber: number;
  tierName: string;
  status: "Pass" | "Partial" | "Blocked" | "Unknown";
  findings: string;
  inferences: string;
  whyItMatters: string;
  source: string;
}

export interface Section5Diagnosis {
  tier: number;
  tierName: string;
  diagnosis: string;
  tierScorecard?: TierScorecardEntry[];
}

export interface PriorityRow {
  priority: number;
  initiative: string;
  tier: string;
  action: string;
  reason: string;
  source?: string;
  actionType?: string;
  impact?: string;
}

export interface CrossSellPreviewItem {
  opportunity: string;
  relevance: string;
  suggestedCategory: string;
}

export interface Section6Priorities {
  priorities: PriorityRow[];
  crossSellPreview?: CrossSellPreviewItem[];
  auditMissing?: boolean;
  strategyBankFetchFailed?: boolean;
  shortSummary?: string[];
}

export interface TrackingRow {
  focusArea: string;
  metric: string;
  source: string;
  status?: string;
  whyItMatters: string;
}

export interface Section7Tracking {
  tracking: TrackingRow[];
}

export interface QssbInsight {
  question: string;
}

export interface QssbOpportunity {
  title: string;
  description: string;
}

export interface SectionQssb {
  clientInsights: QssbInsight[];
  additionalOpportunities: QssbOpportunity[];
}

export interface SourceSnapshot {
  smartSeoClientMeta: Record<string, any> | null;
  nsmTracker: Record<string, any> | null;
  gsc: Record<string, any> | null;
  ga4: Record<string, any> | null;
  gbp: Record<string, any> | null;
  callTracking: Record<string, any> | null;
  screamingFrog: Record<string, any> | null;
  airtable: Record<string, any> | null;
  asana: Record<string, any> | null;
  manualInputs: {
    sentiment?: string;
    clientSentiment?: string;
    hypothesis?: string;
    amThoughts?: string;
    prevQtrAssessment?: string;
    auditNotes?: string;
    priorityChecks?: string;
    clientNotes?: string;
    creditUsage?: string;
  } | null;
}

export interface GenerationMeta {
  generatedAt: string;
  dataSources: string[];
  missingData: string[];
}

export interface AdditionalOpportunity {
  type: "upsell" | "cross_sell";
  title: string;
  why_now: string;
  evidence: string[];
  recommendation: string;
  framing: string;
}

export interface CreditRowData {
  credits: number;
  activity: string;
}

export interface CreditMonthBlock {
  month: string;
  rows: CreditRowData[];
}

export interface Section7Credits {
  months: CreditMonthBlock[];
}

export interface SuggestedKeywordRow {
  keyword: string;
  recommendationType: "optimize-existing" | "refresh-existing" | "create-new" | "cro-update" | "internal-linking" | "technical-seo" | "hub";
  targetPage: string;
  whyRecommended: string;
  sources: string[];
}

export interface SectionSuggestedKeywords {
  rows: SuggestedKeywordRow[];
  quarterlyCreditCap: number;
  monthlyCredits: number;
}

export interface QbrPrepReportData {
  meta: QbrPrepMeta;
  section1Goals: Section1Goals;
  section2Conversions: Section2Conversions;
  section3Traffic: Section3Traffic;
  section4Services: Section4Services;
  section5Diagnosis: Section5Diagnosis;
  section6Priorities: Section6Priorities;
  section7Tracking: Section7Tracking;
  section7Credits?: Section7Credits;
  sectionSuggestedKeywords?: SectionSuggestedKeywords;
  sectionQssb?: SectionQssb;
  additionalOpportunities?: AdditionalOpportunity[];
  gapContext?: GapContext;
  sourceSnapshot: SourceSnapshot;
  generationMeta: GenerationMeta;
  sourceFacts?: Record<string, any>;
}

export const MANUAL_ENTRY = "Manual entry needed";
