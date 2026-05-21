export type QcrCategory = "technical_seo" | "seo_content" | "local_seo" | "seo_strategy";
export type QcrSeverity = "critical" | "medium" | "low";

export type PageType =
  | "informational"
  | "service"
  | "cro"
  | "homepage"
  | "homepage_hub"
  | "commercial"
  | "local_intent"
  | "general";

export interface ParsedPage {
  url: string;
  path: string;
  status: number;
  html: string;
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  noindex: boolean;
  h1s: string[];
  headings: Array<{ level: number; text: string }>;
  internalLinks: string[];
  externalLinks: string[];
  images: Array<{ src: string; alt: string | null }>;
  jsonLdBlocks: any[];
  faqDetected: boolean;
  tldrDetected: boolean;
  keyTakeawaysDetected: boolean;
  introInternalLink: boolean;
  bodyText: string;
  wordCount: number;
  pageType: PageType;
  fetchedAt: string;
  fetchError?: string;
}

export interface QcrFinding {
  id: string;
  category: QcrCategory;
  severity: QcrSeverity;
  ruleId: string;
  title: string;
  description: string;
  affectedUrls: string[];
  affectedUrlsSampleSize: number;
  evidence: Record<string, unknown>;
  asanaTaskId?: string;
  asanaTaskUrl?: string;
  pushedAt?: string;
  suppressed?: boolean;
}

export interface QcrIntegrationsUsed {
  gsc: boolean;
  ga4: boolean;
  ahrefs: boolean;
  gbp: boolean;
  airtable: boolean;
}

export interface QcrReport {
  reportType: "quarterly_content_roadmap";
  clientId: number;
  clientName: string;
  scanStartedAt: string;
  scanCompletedAt: string;
  scanDurationMs: number;
  urlsScanned: number;
  urlsAttempted: number;
  integrationsUsed: QcrIntegrationsUsed;
  categories: Record<QcrCategory, { findings: QcrFinding[] }>;
}

export type QcrProgressEvent =
  | { type: "started"; jobId: string; clientId: number; clientName: string }
  | { type: "step_start"; step: string; label: string }
  | { type: "step_progress"; step: string; current: number; total: number }
  | { type: "step_complete"; step: string; elapsedMs: number; findingsCount?: number }
  | { type: "integration_skipped"; integration: string; reason: string }
  | { type: "completed"; jobId: string; reportSummary: { totalFindings: number; byCategory: Record<QcrCategory, number> } }
  | { type: "error"; message: string };

export interface JobState {
  jobId: string;
  clientId: number;
  status: "queued" | "running" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  events: QcrProgressEvent[];
  subscribers: Set<(event: QcrProgressEvent) => void>;
  result?: QcrReport;
  savedReportId?: number;
  error?: string;
}
