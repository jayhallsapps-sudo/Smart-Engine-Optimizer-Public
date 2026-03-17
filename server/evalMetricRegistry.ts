import type { MetricDefinition } from "@shared/schema";

// ─── Metric Registry ──────────────────────────────────────────────────────────
// Single source of truth for all Main Evaluation metrics.
// Drives field sourcing, refresh jobs, and source traceability.

export const METRIC_REGISTRY: MetricDefinition[] = [
  // Domain / Age metrics
  {
    metricKey: "whoisReg",
    label: "WHOIS Reg",
    sourceTool: "web_retrieval",
    sourceType: "web_retrieval",
    retrievalMethod: "whois search (GoDaddy or public WHOIS)",
    rankDirection: "asc",
    refreshable: true,
    fallbackBehavior: "flag as needs_review if unavailable",
    notes: "Registration date from public WHOIS. Older = less rank advantage in most cases.",
  },
  {
    metricKey: "age",
    label: "Age (years)",
    sourceTool: "system",
    sourceType: "derived",
    calculationFormula: "today - whoisReg (in years)",
    rankDirection: "desc",
    refreshable: false,
    notes: "Domain age in years, derived from WHOIS registration date.",
  },
  {
    metricKey: "firstArchive",
    label: "First Archive",
    sourceTool: "web_retrieval",
    sourceType: "web_retrieval",
    retrievalMethod: "Wayback Machine earliest snapshot",
    rankDirection: "asc",
    refreshable: true,
    fallbackBehavior: "flag as unavailable, skip velocity formulas",
  },
  {
    metricKey: "archiveAge",
    label: "Archive Age (years)",
    sourceTool: "system",
    sourceType: "derived",
    calculationFormula: "today - firstArchive (in years)",
    rankDirection: "desc",
    refreshable: false,
  },
  // Ahrefs metrics
  {
    metricKey: "dr",
    label: "DR",
    sourceTool: "ahrefs",
    sourceType: "integration",
    retrievalMethod: "Ahrefs batch domain analysis",
    rankDirection: "desc",
    refreshable: true,
  },
  {
    metricKey: "referringDomains",
    label: "Referring Domains",
    sourceTool: "ahrefs",
    sourceType: "integration",
    retrievalMethod: "Ahrefs batch domain analysis",
    rankDirection: "desc",
    refreshable: true,
  },
  {
    metricKey: "backlinks",
    label: "Backlinks",
    sourceTool: "ahrefs",
    sourceType: "integration",
    retrievalMethod: "Ahrefs batch domain analysis",
    rankDirection: "desc",
    refreshable: true,
  },
  {
    metricKey: "organicTraffic",
    label: "Organic Traffic",
    sourceTool: "ahrefs",
    sourceType: "integration",
    retrievalMethod: "Ahrefs batch domain analysis",
    rankDirection: "desc",
    refreshable: true,
    notes: "From Ahrefs. For client, GSC/GA4 data takes priority.",
  },
  {
    metricKey: "organicKeywords",
    label: "Organic Keywords",
    sourceTool: "ahrefs",
    sourceType: "integration",
    retrievalMethod: "Ahrefs batch domain analysis",
    rankDirection: "desc",
    refreshable: true,
    fallbackBehavior: "SEMrush organic_overview as fallback",
  },
  {
    metricKey: "top10Keywords",
    label: "Top 10 Keywords",
    sourceTool: "ahrefs",
    sourceType: "integration",
    retrievalMethod: "Ahrefs batch analysis (Top 1-3 + Top 4-10 combined)",
    rankDirection: "desc",
    refreshable: true,
  },
  // Indexation
  {
    metricKey: "indexedPages",
    label: "Indexed Pages",
    sourceTool: "screaming_frog_upload",
    sourceType: "uploaded",
    retrievalMethod: "Screaming Frog indexable URL count; fallback to site:domain estimate",
    rankDirection: "desc",
    refreshable: true,
    fallbackBehavior: "GSC coverage data, then Ahrefs/SEMrush page count",
  },
  // SEMrush AI metrics
  {
    metricKey: "aiVisibilityScore",
    label: "AI Visibility Score",
    sourceTool: "semrush",
    sourceType: "integration",
    retrievalMethod: "SEMrush AI tool",
    rankDirection: "desc",
    refreshable: true,
  },
  {
    metricKey: "aiMentions",
    label: "Mentions (AI Responses)",
    sourceTool: "semrush",
    sourceType: "integration",
    retrievalMethod: "SEMrush AI tool",
    rankDirection: "desc",
    refreshable: true,
  },
  {
    metricKey: "citedSources",
    label: "Cited Sources",
    sourceTool: "semrush",
    sourceType: "integration",
    retrievalMethod: "SEMrush AI tool",
    rankDirection: "desc",
    refreshable: true,
  },
  {
    metricKey: "informationalKeywords",
    label: "Informational Keywords",
    sourceTool: "semrush",
    sourceType: "integration",
    retrievalMethod: "SEMrush organic rankings, US only, informational intent filter",
    rankDirection: "desc",
    refreshable: true,
  },
  {
    metricKey: "featuredSnippets",
    label: "Featured Snippet / AIO",
    sourceTool: "semrush",
    sourceType: "integration",
    retrievalMethod: "SEMrush SERP features filter (Featured Snippet, AI Overview)",
    rankDirection: "desc",
    refreshable: true,
  },
  // Derived / velocity metrics
  {
    metricKey: "kwVelocity",
    label: "KW Velocity",
    sourceTool: "system",
    sourceType: "derived",
    calculationFormula: "organicKeywords / age",
    rankDirection: "desc",
    refreshable: false,
    notes: "Growth rate of ranking keywords per year",
  },
  {
    metricKey: "snippetVelocity",
    label: "Snippet Velocity",
    sourceTool: "system",
    sourceType: "derived",
    calculationFormula: "featuredSnippets / age",
    rankDirection: "desc",
    refreshable: false,
  },
  {
    metricKey: "rdVelocity",
    label: "RD Velocity",
    sourceTool: "system",
    sourceType: "derived",
    calculationFormula: "referringDomains / age",
    rankDirection: "desc",
    refreshable: false,
    notes: "Growth rate of referring domains per year",
  },
  {
    metricKey: "contentVelocity",
    label: "Content Velocity",
    sourceTool: "system",
    sourceType: "derived",
    calculationFormula: "indexedPages / age",
    rankDirection: "desc",
    refreshable: false,
  },
  {
    metricKey: "kwYield",
    label: "KW Yield",
    sourceTool: "system",
    sourceType: "derived",
    calculationFormula: "organicTraffic / organicKeywords",
    rankDirection: "desc",
    refreshable: false,
    notes: "Traffic efficiency per ranking keyword",
  },
  {
    metricKey: "snippetYield",
    label: "Snippet Yield",
    sourceTool: "system",
    sourceType: "derived",
    calculationFormula: "organicTraffic / featuredSnippets",
    rankDirection: "desc",
    refreshable: false,
  },
  {
    metricKey: "mentionRate",
    label: "Mention Rate (%)",
    sourceTool: "system",
    sourceType: "derived",
    calculationFormula: "aiMentions / citedSources * 100",
    rankDirection: "desc",
    refreshable: false,
    notes: "When mentioned in AI, how often also cited as trusted source",
  },
  {
    metricKey: "rdYield",
    label: "RD Yield",
    sourceTool: "system",
    sourceType: "derived",
    calculationFormula: "organicTraffic / referringDomains",
    rankDirection: "desc",
    refreshable: false,
  },
  {
    metricKey: "contentYield",
    label: "Content Yield",
    sourceTool: "system",
    sourceType: "derived",
    calculationFormula: "organicTraffic / indexedPages",
    rankDirection: "desc",
    refreshable: false,
  },
  {
    metricKey: "backlinkDensity",
    label: "Backlink Density",
    sourceTool: "system",
    sourceType: "derived",
    calculationFormula: "backlinks / referringDomains",
    rankDirection: "desc",
    refreshable: false,
    notes: "Backlink concentration per referring domain. Higher = stronger link mix.",
  },
  {
    metricKey: "informationalDensity",
    label: "Informational Density",
    sourceTool: "system",
    sourceType: "derived",
    calculationFormula: "informationalKeywords / organicKeywords",
    rankDirection: "desc",
    refreshable: false,
    notes: "Share of keyword portfolio focused on informational intent",
  },
  {
    metricKey: "finalScore",
    label: "Final Score",
    sourceTool: "system",
    sourceType: "derived",
    calculationFormula: "weighted average of rank positions across benchmark metrics",
    rankDirection: "asc",
    refreshable: false,
    notes: "Lower final score = better overall rank position",
  },
  {
    metricKey: "averageRank",
    label: "Average Rank",
    sourceTool: "system",
    sourceType: "derived",
    calculationFormula: "mean of all rank columns",
    rankDirection: "asc",
    refreshable: false,
  },
];

export const METRIC_KEYS = METRIC_REGISTRY.map(m => m.metricKey);

export const RAW_METRIC_KEYS = [
  "whoisReg", "firstArchive", "dr", "referringDomains", "backlinks",
  "organicTraffic", "organicKeywords", "top10Keywords", "indexedPages",
  "aiVisibilityScore", "aiMentions", "citedSources", "informationalKeywords", "featuredSnippets",
];

export const DERIVED_METRIC_KEYS = [
  "age", "archiveAge", "kwVelocity", "snippetVelocity", "rdVelocity", "contentVelocity",
  "kwYield", "snippetYield", "mentionRate", "rdYield", "contentYield",
  "backlinkDensity", "informationalDensity", "finalScore", "averageRank",
];

// ─── Category Rule Engine ─────────────────────────────────────────────────────
// Default rules for classifying URLs into page categories

export interface CategoryRule {
  category: string;
  patterns: string[];
  priority: number;
}

export const DEFAULT_CATEGORY_RULES: CategoryRule[] = [
  { category: "Home", patterns: ["^/$", "^/index"], priority: 100 },
  { category: "Care access", patterns: ["/verify-insurance", "/verify_insurance", "/insurance", "/vob", "/admissions", "/start-here", "/contact", "/get-help", "/reach-us"], priority: 90 },
  { category: "Blogs", patterns: ["/blog/", "/post/", "/news/", "/articles/", "/resources/blog"], priority: 80 },
  { category: "Conditions", patterns: ["/conditions/", "/substance-use/", "/alcohol/", "/cocaine/", "/heroin/", "/fentanyl/", "/meth", "/marijuana", "/benzodiazepines", "/prescription-drugs", "/opioid"], priority: 70 },
  { category: "MH Conditions", patterns: ["/mental-health/", "/co-occurring/", "/depression", "/anxiety", "/ptsd", "/bipolar", "/adhd", "/schizophrenia", "/borderline", "/ocd"], priority: 70 },
  { category: "Modalities", patterns: ["/programs/", "/treatment/", "/therapy/", "/detox", "/residential", "/php", "/iop", "/outpatient", "/inpatient", "/aftercare", "/sober-living"], priority: 60 },
  { category: "About", patterns: ["/about", "/our-story", "/mission", "/team", "/staff", "/clinical", "/accreditation", "/location", "/facility"], priority: 50 },
  { category: "Luxury Experience", patterns: ["/luxury", "/amenities", "/experience", "/resort"], priority: 45 },
];

export function classifyUrl(url: string, customRules?: CategoryRule[]): string {
  const rules = customRules ?? DEFAULT_CATEGORY_RULES;
  const path = url.replace(/^https?:\/\/[^/]+/, "").toLowerCase();

  // Exact home match
  if (path === "" || path === "/") return "Home";

  // Sort by priority desc
  const sorted = [...rules].sort((a, b) => b.priority - a.priority);
  for (const rule of sorted) {
    for (const pattern of rule.patterns) {
      if (new RegExp(pattern, "i").test(path)) return rule.category;
    }
  }
  return "Other";
}
