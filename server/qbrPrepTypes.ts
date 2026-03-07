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
}

export interface ConvertingSourceRow {
  source: string;
  whatsConverting: string;
  notes: string;
}

export interface Section2Conversions {
  topConvertingPages: ConvertingPageRow[];
  topConvertingSources: ConvertingSourceRow[];
}

export interface TrafficTopicRow {
  topic: string;
  exampleQueries: string;
  connectionToAdmits: string;
  insight: string;
}

export interface TrafficPageRow {
  page: string;
  clicks: string;
  ctr: string;
  connectionToAdmits: string;
  insight: string;
}

export interface Section3Traffic {
  topTrafficTopics: TrafficTopicRow[];
  topTrafficPages: TrafficPageRow[];
}

export interface ServiceRow {
  service: string;
  examplePage: string;
}

export interface Section4Services {
  services: ServiceRow[];
}

export interface Section5Diagnosis {
  tier: number;
  tierName: string;
  diagnosis: string;
}

export interface PriorityRow {
  priority: number;
  initiative: string;
  tier: string;
  action: string;
  reason: string;
}

export interface Section6Priorities {
  priorities: PriorityRow[];
}

export interface TrackingRow {
  focusArea: string;
  metric: string;
  source: string;
  whyItMatters: string;
}

export interface Section7Tracking {
  tracking: TrackingRow[];
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
    hypothesis?: string;
    auditNotes?: string;
  } | null;
}

export interface GenerationMeta {
  generatedAt: string;
  dataSources: string[];
  missingData: string[];
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
  sourceSnapshot: SourceSnapshot;
  generationMeta: GenerationMeta;
}

export const MANUAL_ENTRY = "Manual entry needed";
