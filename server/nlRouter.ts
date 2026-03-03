import type { Client, Command } from "@shared/schema";

interface ParsedIntent {
  command: Command;
  clientId: number;
  dateRange: string;
  filters: Record<string, any>;
  branded?: boolean;
}

/**
 * Data source priority tiers.
 * Lower number = higher priority. When two commands both match a query,
 * the command from the lower-numbered tier wins regardless of keyword length.
 *
 * Tier 1: Google (GSC + GA4)
 * Tier 2: Screaming Frog
 * Tier 3: Call tracking (CallRail, CTM, Nimbata)
 * Tier 4: Airtable
 * Tier 5: SEMrush
 * Tier 6: Ahrefs (always last — blocked on this plan)
 * Tier 9: Neutral / utility commands (no source preference)
 */
const SOURCE_PRIORITY: Record<Command, number> = {
  // Tier 1 — Google
  gsc_qoq_queries: 1,
  gsc_qoq_pages: 1,
  gsc_top_queries: 1,
  gsc_query_to_page_map: 1,
  gsc_high_impressions_low_ctr: 1,
  gsc_high_traffic_low_cvr: 1,
  gsc_indexation_stability: 1,
  ga4_qoq_organic_funnel: 1,
  ga4_qoq_organic_landing_pages: 1,
  ga4_combined_funnel: 1,
  ga4_qtd_totals: 1,
  ga4_landing_pages_by_sessions: 1,
  ga4_landing_pages_by_conversions: 1,
  ga4_session_movers: 1,
  ga4_conversion_movers: 1,
  ga4_yoy_comparison: 1,
  // Tier 2 — Screaming Frog
  technical_health_summary: 2,
  core_web_vitals: 2,
  new_pages_tracker: 2,
  // Tier 3 — Call tracking
  callrail_qoq_organic_calls: 3,
  callrail_qoq_top_landing_pages: 3,
  callrail_summary: 3,
  ctm_qoq_organic_calls: 3,
  ctm_qoq_top_landing_pages: 3,
  // Tier 4 — Airtable
  airtable_work_log: 4,
  content_output_summary: 4,
  // Tier 5 — GBP & utility signals
  gbp_local_summary: 5,
  tracking_anomaly_check: 5,
  monthly_trendline: 5,
  quarterly_forecast: 5,
  // Tier 6 — SEMrush
  semrush_organic_overview: 6,
  semrush_keyword_rankings: 6,
  semrush_keyword_distribution: 6,
  semrush_competitor_visibility: 6,
  // Tier 7 — Ahrefs (blocked)
  ahrefs_backlink_overview: 7,
  ahrefs_keyword_rankings: 7,
  ahrefs_competitor_visibility: 7,
};

/**
 * Scoring formula: higher score wins.
 * Source priority converts tier → bonus: (10 - tier) * 1000
 * So a Tier 1 command gets +9000, Tier 5 gets +5000, Tier 6 gets +4000.
 * This means a 5-char Google keyword always outranks a 30-char SEMrush keyword.
 */
function commandScore(command: Command, keywordLength: number): number {
  const tier = SOURCE_PRIORITY[command] ?? 9;
  return (10 - tier) * 1000 + keywordLength;
}

const COMMAND_KEYWORDS: Record<Command, string[]> = {
  // Google Search Console
  gsc_qoq_queries: ["gsc queries", "search queries", "search terms", "query performance"],
  gsc_qoq_pages: ["gsc pages", "page performance", "urls performance"],
  gsc_top_queries: ["top 20 queries", "top queries", "top 30 queries", "all queries", "queries table", "keywords table"],
  gsc_query_to_page_map: ["query to page", "queries per page", "page queries", "what queries drive", "keyword to page"],
  gsc_high_impressions_low_ctr: ["high impressions low ctr", "low ctr", "ctr opportunities", "impressions opportunity", "high impression pages"],
  gsc_high_traffic_low_cvr: ["high traffic low conversion", "low cvr pages", "traffic not converting", "underperforming pages cvr"],
  gsc_indexation_stability: ["indexation", "indexed pages", "coverage errors", "excluded pages", "index coverage"],
  // Google Analytics 4
  ga4_qoq_organic_funnel: ["organic funnel", "admissions funnel", "funnel quarter", "qoq funnel"],
  ga4_qoq_organic_landing_pages: ["ga4 landing pages", "organic landing", "ga4 pages", "landing pages quarter"],
  ga4_combined_funnel: ["combined funnel", "funnel snapshot", "sessions and calls", "sessions calls forms", "full funnel", "funnel summary"],
  ga4_qtd_totals: ["qtd", "quarter to date", "qtd totals", "quarter goal", "vs goal"],
  ga4_landing_pages_by_sessions: ["top pages by sessions", "top landing pages sessions", "pages by sessions", "landing pages by traffic"],
  ga4_landing_pages_by_conversions: ["top pages by conversions", "top landing pages conversions", "pages by leads", "landing pages by conversions"],
  ga4_session_movers: ["session movers", "traffic movers", "sessions up down", "page gainers losers sessions"],
  ga4_conversion_movers: ["conversion movers", "lead movers", "conversions up down", "page gainers losers conversions"],
  ga4_yoy_comparison: ["year over year", "yoy comparison", "same month last year", "yoy monthly", "yoy sessions"],
  // Screaming Frog / Technical
  technical_health_summary: ["technical health", "technical issues", "crawl errors", "technical seo summary", "site health", "screaming frog"],
  core_web_vitals: ["core web vitals", "cwv", "lcp", "cls", "inp", "page experience"],
  new_pages_tracker: ["new pages", "updated pages", "pages tracker", "recently published", "new urls"],
  // Call tracking
  callrail_qoq_organic_calls: ["callrail calls", "callrail organic", "callrail volume", "callrail qoq"],
  callrail_qoq_top_landing_pages: ["callrail landing", "callrail pages", "calls by page"],
  callrail_summary: ["callrail summary", "call summary", "answered rate", "qualified calls", "call quality", "missed calls"],
  ctm_qoq_organic_calls: ["ctm calls", "calltracking calls", "call tracking metrics", "ctm organic", "ctm volume"],
  ctm_qoq_top_landing_pages: ["ctm landing", "ctm pages", "ctm by page"],
  // Airtable
  airtable_work_log: ["work log", "work completed", "what we shipped", "tasks completed", "deliverables", "work done", "work we did"],
  content_output_summary: ["content published", "content output", "pages published", "content production", "new content", "refreshed pages"],
  // SEMrush — only matched when no Google equivalent applies
  semrush_organic_overview: ["semrush overview", "semrush organic", "semrush traffic", "organic research"],
  semrush_keyword_rankings: ["semrush keywords", "semrush rankings", "semrush keyword", "position tracking"],
  semrush_keyword_distribution: ["keyword distribution", "top 3 top 10", "keyword tiers", "ranking tiers", "position distribution"],
  semrush_competitor_visibility: ["competitor visibility", "share of voice", "competitor traffic", "semrush competitors", "top competitors"],
  // Ahrefs — always last resort (and currently blocked)
  ahrefs_backlink_overview: ["backlinks", "backlink overview", "referring domains", "domain rating", "ahrefs backlinks"],
  ahrefs_keyword_rankings: ["ahrefs keywords", "ahrefs rankings", "ahrefs keyword", "keyword rankings ahrefs"],
  ahrefs_competitor_visibility: ["ahrefs competitors", "competitor visibility ahrefs", "ahrefs share of voice"],
  // Neutral / utility
  gbp_local_summary: ["gbp", "google business", "local seo", "reviews", "google profile", "local summary"],
  tracking_anomaly_check: ["tracking anomaly", "tracking issues", "ga4 events", "missing events", "data anomaly"],
  monthly_trendline: ["monthly trendline", "3 month breakdown", "month by month", "monthly trend", "trendline"],
  quarterly_forecast: ["forecast", "next quarter forecast", "q+1 forecast", "base case upside", "projections"],
};

const DATE_RANGE_KEYWORDS: Record<string, string> = {
  "qtd": "qtd",
  "quarter to date": "qtd",
  "qoq": "last_90_vs_prev_90",
  "quarter over quarter": "last_90_vs_prev_90",
  "last 90": "last_90_vs_prev_90",
  "last 30": "last_30_vs_prev_30",
  "month over month": "last_30_vs_prev_30",
  "mom": "last_30_vs_prev_30",
  "last 14": "last_14_vs_prev_14",
  "biweekly": "last_14_vs_prev_14",
  "fortnight": "last_14_vs_prev_14",
  "yoy": "last_365_vs_prev_365",
  "year over year": "last_365_vs_prev_365",
};

export function parseNaturalQuery(
  query: string,
  clients: Client[]
): { intent: ParsedIntent | null; error?: string; suggestions?: string[] } {
  const lowerQuery = query.toLowerCase().trim();

  let matchedClient: Client | null = null;
  for (const client of clients) {
    if (lowerQuery.includes(client.name.toLowerCase())) {
      matchedClient = client;
      break;
    }
  }

  if (!matchedClient && clients.length === 1) {
    matchedClient = clients[0];
  }

  if (!matchedClient) {
    return {
      intent: null,
      error: "I couldn't identify which client you're asking about. Please select a client or mention their name.",
      suggestions: clients.map(c => c.name),
    };
  }

  let detectedCommand: Command | null = null;
  let maxScore = 0;

  for (const [command, keywords] of Object.entries(COMMAND_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerQuery.includes(keyword)) {
        const score = commandScore(command as Command, keyword.length);
        if (score > maxScore) {
          maxScore = score;
          detectedCommand = command as Command;
        }
      }
    }
  }

  // Fallback heuristics — same priority ordering applies:
  // Google first, then Screaming Frog, then call tracking, then Airtable, then SEMrush
  if (!detectedCommand) {
    if (lowerQuery.includes("work log") || lowerQuery.includes("deliverable") || lowerQuery.includes("shipped")) {
      detectedCommand = "airtable_work_log";
    } else if (lowerQuery.includes("crawl") || lowerQuery.includes("technical") || lowerQuery.includes("site health")) {
      detectedCommand = "technical_health_summary";
    } else if (lowerQuery.includes("ctm") || lowerQuery.includes("call tracking metrics") || lowerQuery.includes("calltracking")) {
      detectedCommand = "ctm_qoq_organic_calls";
    } else if (lowerQuery.includes("call")) {
      detectedCommand = "callrail_summary";
    } else if (lowerQuery.includes("funnel") || lowerQuery.includes("conver") || lowerQuery.includes("admission") || lowerQuery.includes("vob")) {
      detectedCommand = "ga4_combined_funnel";
    } else if (lowerQuery.includes("land")) {
      detectedCommand = "ga4_landing_pages_by_sessions";
    } else if (lowerQuery.includes("quer") || lowerQuery.includes("keyword")) {
      detectedCommand = "gsc_top_queries";
    } else if (lowerQuery.includes("page")) {
      detectedCommand = "gsc_qoq_pages";
    } else if (lowerQuery.includes("backlink") || lowerQuery.includes("referring") || lowerQuery.includes("ahrefs")) {
      detectedCommand = "ahrefs_backlink_overview";
    } else if (lowerQuery.includes("semrush")) {
      detectedCommand = "semrush_organic_overview";
    } else if (lowerQuery.includes("forecast") || lowerQuery.includes("predict")) {
      detectedCommand = "quarterly_forecast";
    } else {
      detectedCommand = "gsc_top_queries";
    }
  }

  let dateRange = "last_90_vs_prev_90";
  for (const [keyword, range] of Object.entries(DATE_RANGE_KEYWORDS)) {
    if (lowerQuery.includes(keyword)) {
      dateRange = range;
      break;
    }
  }

  const branded = lowerQuery.includes("branded") || lowerQuery.includes("brand");
  const nonBranded = lowerQuery.includes("non-branded") || lowerQuery.includes("non branded") || lowerQuery.includes("nonbranded");

  const filters: Record<string, any> = {};
  if (nonBranded) {
    filters.brandFilter = "non-branded";
  } else if (branded) {
    filters.brandFilter = "branded";
  }

  return {
    intent: {
      command: detectedCommand,
      clientId: matchedClient.id,
      dateRange,
      filters,
      branded: branded && !nonBranded,
    },
  };
}

export function getCommandDescription(command: Command): string {
  const descriptions: Record<Command, string> = {
    gsc_qoq_queries: "GSC Query Performance (QoQ)",
    gsc_qoq_pages: "GSC Page Performance (QoQ)",
    ga4_qoq_organic_funnel: "GA4 Organic Funnel (QoQ)",
    ga4_qoq_organic_landing_pages: "GA4 Organic Landing Pages (QoQ)",
    ga4_combined_funnel: "Combined Funnel Snapshot (Sessions + Forms + Calls + CVR)",
    ga4_qtd_totals: "Quarter-to-Date Funnel Totals vs Goal",
    ga4_landing_pages_by_sessions: "Top Landing Pages by Sessions (Full Funnel)",
    ga4_landing_pages_by_conversions: "Top Landing Pages by Conversions",
    ga4_session_movers: "Page-Level Session Movers (Top 5 Up / Down)",
    ga4_conversion_movers: "Page-Level Conversion Movers (Top 5 Up / Down)",
    ga4_yoy_comparison: "Year-over-Year Monthly Comparison",
    gsc_top_queries: "Top GSC Queries with Period Deltas",
    gsc_query_to_page_map: "Query-to-Page Conversion Mapping",
    gsc_high_impressions_low_ctr: "High Impressions / Low CTR Opportunities",
    gsc_high_traffic_low_cvr: "High Traffic / Low Conversion Diagnostic",
    gsc_indexation_stability: "Indexation Stability (Indexed vs Excluded)",
    callrail_qoq_organic_calls: "CallRail Organic Calls (QoQ)",
    callrail_qoq_top_landing_pages: "CallRail Top Landing Pages (QoQ)",
    callrail_summary: "CallRail Summary (Answered Rate, Qualified, Sources)",
    ctm_qoq_organic_calls: "CTM Organic Calls (QoQ)",
    ctm_qoq_top_landing_pages: "CTM Top Landing Pages (QoQ)",
    ahrefs_backlink_overview: "Ahrefs Backlink Overview",
    ahrefs_keyword_rankings: "Ahrefs Keyword Rankings",
    ahrefs_competitor_visibility: "Ahrefs Competitor Visibility",
    semrush_organic_overview: "SEMrush Organic Overview",
    semrush_keyword_rankings: "SEMrush Keyword Rankings",
    semrush_keyword_distribution: "SEMrush Keyword Distribution by Tier",
    semrush_competitor_visibility: "SEMrush Competitor Visibility (Share of Voice)",
    content_output_summary: "Content Output Summary (Published / Refreshed)",
    technical_health_summary: "Technical Health Summary (Screaming Frog)",
    core_web_vitals: "Core Web Vitals Trend",
    gbp_local_summary: "GBP / Local SEO Summary",
    new_pages_tracker: "New & Updated Pages Tracker",
    tracking_anomaly_check: "Tracking Anomaly Check",
    monthly_trendline: "Monthly Trendline (3-Month Breakdown)",
    quarterly_forecast: "Next-Quarter Forecast (Base / Upside / Downside)",
    airtable_work_log: "Work Log by Category (Airtable)",
  };
  return descriptions[command];
}

export function getCommandSourceTier(command: Command): number {
  return SOURCE_PRIORITY[command] ?? 9;
}

export function getDateRangeLabel(dateRange: string): string {
  const labels: Record<string, string> = {
    last_90_vs_prev_90: "Last 90 Days vs Previous 90 Days",
    last_30_vs_prev_30: "Last 30 Days vs Previous 30 Days",
    last_14_vs_prev_14: "Last 14 Days vs Previous 14 Days",
    last_365_vs_prev_365: "Last 365 Days vs Previous 365 Days",
    qtd: "Quarter-to-Date",
  };
  return labels[dateRange] || dateRange;
}
