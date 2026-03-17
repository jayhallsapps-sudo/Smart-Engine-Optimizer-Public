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
  // Home
  { category: "Home", patterns: ["^/$", "^/index\\.", "^/home$"], priority: 100 },

  // Insurance / Admissions / Conversion pages (highest priority after home)
  { category: "Insurance & Admissions", patterns: [
    "/verify-insurance", "/verify_insurance", "/insurance-verification", "/insurance-coverage",
    "/insurance", "/vob", "/admissions", "/start-here", "/get-help", "/reach-us",
    "/contact", "/contact-us", "/get-started", "/intake", "/enroll", "/apply",
    "/free-assessment", "/assessment", "/get-treatment",
  ], priority: 92 },

  // Blog / Resources / Educational content
  { category: "Blog & Resources", patterns: [
    "/blog", "/post/", "/news/", "/articles/", "/resources/", "/education/",
    "/faq", "/faqs", "/glossary", "/guide/", "/guides/", "/learn/",
    "/what-is", "/how-to", "/understanding", "/signs-of", "/symptoms-of",
  ], priority: 80 },

  // Substance use / addiction conditions
  { category: "Substance Use Conditions", patterns: [
    "/conditions/", "/substance-use/", "/substance-abuse/", "/addiction/",
    "/alcohol", "/alcoholism", "/cocaine", "/crack", "/heroin", "/fentanyl",
    "/meth", "/methamphetamine", "/marijuana", "/cannabis", "/weed",
    "/benzodiazepines", "/benzos", "/xanax", "/valium", "/prescription-drugs",
    "/opioid", "/opioids", "/opiate", "/opiates", "/painkillers",
    "/stimulants", "/kratom", "/polysubstance", "/poly-substance",
  ], priority: 72 },

  // Mental health conditions
  { category: "Mental Health Conditions", patterns: [
    "/mental-health/", "/co-occurring/", "/dual-diagnosis/",
    "/depression", "/anxiety", "/ptsd", "/trauma",
    "/bipolar", "/adhd", "/schizophrenia", "/borderline", "/bpd",
    "/ocd", "/eating-disorder", "/anorexia", "/bulimia",
    "/personality-disorder", "/psychosis", "/grief",
  ], priority: 71 },

  // Detox (separate from general modalities — usually high-value)
  { category: "Detox", patterns: [
    "/detox", "/detoxification", "/medical-detox", "/drug-detox", "/alcohol-detox",
    "/withdrawal", "/medically-supervised",
  ], priority: 68 },

  // Residential / Inpatient programs
  { category: "Residential Treatment", patterns: [
    "/residential", "/inpatient", "/live-in", "/long-term", "/30-day", "/60-day", "/90-day",
    "/drug-rehab", "/alcohol-rehab", "/addiction-rehab", "/rehab-center",
  ], priority: 66 },

  // Partial / Day programs
  { category: "PHP & IOP", patterns: [
    "/php", "/partial-hospitalization", "/day-program", "/day-treatment",
    "/iop", "/intensive-outpatient", "/evening-program",
  ], priority: 64 },

  // Outpatient / Continuing care
  { category: "Outpatient & Aftercare", patterns: [
    "/outpatient", "/op-program", "/aftercare", "/continuing-care",
    "/sober-living", "/recovery-house", "/halfway-house", "/transitional",
    "/step-down", "/alumni", "/alumni-program",
  ], priority: 62 },

  // Therapy & Modalities (catch-all for therapy types)
  { category: "Therapies & Modalities", patterns: [
    "/programs/", "/treatment/", "/therapy/", "/therapies/", "/services/",
    "/cbt", "/cognitive-behavioral", "/dbt", "/dialectical", "/emdr",
    "/holistic", "/yoga", "/meditation", "/mindfulness", "/equine",
    "/art-therapy", "/music-therapy", "/group-therapy", "/individual-therapy",
    "/family-therapy", "/trauma-therapy", "/brainspotting",
    "/medication-assisted", "/mat", "/suboxone", "/vivitrol",
    "/12-step", "/non-12-step", "/faith-based",
  ], priority: 60 },

  // About / Trust signals
  { category: "About & Trust", patterns: [
    "/about", "/our-story", "/mission", "/vision", "/values",
    "/team", "/staff", "/doctors", "/therapists", "/counselors", "/leadership",
    "/clinical", "/accreditation", "/licensure", "/certifications",
    "/location", "/facility", "/campus", "/virtual-tour",
    "/testimonials", "/reviews", "/success-stories",
  ], priority: 50 },

  // Luxury / Premium experience
  { category: "Luxury Experience", patterns: [
    "/luxury", "/amenities", "/experience", "/resort", "/premium",
    "/private", "/executive", "/vip", "/concierge",
  ], priority: 45 },

  // Legal / Utility pages (low value — separate from everything else)
  { category: "Legal & Utility", patterns: [
    "/privacy", "/terms", "/disclaimer", "/sitemap", "/accessibility",
    "/cookie", "/404", "/error", "/robots",
  ], priority: 10 },
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
