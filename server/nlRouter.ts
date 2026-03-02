import type { Client, Command } from "@shared/schema";

interface ParsedIntent {
  command: Command;
  clientId: number;
  dateRange: string;
  filters: Record<string, any>;
  branded?: boolean;
}

const COMMAND_KEYWORDS: Record<Command, string[]> = {
  gsc_qoq_queries: ["queries", "keywords", "search terms", "gsc queries", "search queries", "keyword performance"],
  gsc_qoq_pages: ["gsc pages", "page performance", "urls performance"],
  ga4_qoq_organic_funnel: ["funnel", "organic funnel", "conversions", "cvr", "conversion rate", "organic traffic", "sessions", "admissions funnel"],
  ga4_qoq_organic_landing_pages: ["landing pages", "organic landing", "ga4 landing", "ga4 pages", "organic pages"],
  callrail_qoq_organic_calls: ["callrail calls", "callrail organic", "callrail volume"],
  callrail_qoq_top_landing_pages: ["callrail landing", "callrail pages", "calls by page"],
  ctm_qoq_organic_calls: ["ctm calls", "calltracking calls", "call tracking metrics", "ctm organic", "ctm volume"],
  ctm_qoq_top_landing_pages: ["ctm landing", "ctm pages", "ctm by page"],
  ahrefs_backlink_overview: ["backlinks", "backlink overview", "referring domains", "domain rating", "ahrefs backlinks", "dr"],
  ahrefs_keyword_rankings: ["ahrefs keywords", "ahrefs rankings", "ahrefs keyword", "keyword rankings ahrefs"],
  semrush_organic_overview: ["semrush overview", "semrush organic", "semrush traffic", "organic research"],
  semrush_keyword_rankings: ["semrush keywords", "semrush rankings", "semrush keyword", "position tracking"],
};

const DATE_RANGE_KEYWORDS: Record<string, string> = {
  "qoq": "last_90_vs_prev_90",
  "quarter over quarter": "last_90_vs_prev_90",
  "last 90": "last_90_vs_prev_90",
  "last 30": "last_30_vs_prev_30",
  "month over month": "last_30_vs_prev_30",
  "mom": "last_30_vs_prev_30",
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
        const score = keyword.length;
        if (score > maxScore) {
          maxScore = score;
          detectedCommand = command as Command;
        }
      }
    }
  }

  if (!detectedCommand) {
    if (lowerQuery.includes("backlink") || lowerQuery.includes("referring") || lowerQuery.includes("ahrefs")) {
      detectedCommand = "ahrefs_backlink_overview";
    } else if (lowerQuery.includes("semrush")) {
      detectedCommand = "semrush_organic_overview";
    } else if (lowerQuery.includes("ctm") || lowerQuery.includes("call tracking metrics") || lowerQuery.includes("calltracking")) {
      detectedCommand = "ctm_qoq_organic_calls";
    } else if (lowerQuery.includes("call")) {
      detectedCommand = "callrail_qoq_organic_calls";
    } else if (lowerQuery.includes("land")) {
      detectedCommand = "ga4_qoq_organic_landing_pages";
    } else if (lowerQuery.includes("quer") || lowerQuery.includes("keyword")) {
      detectedCommand = "gsc_qoq_queries";
    } else if (lowerQuery.includes("page")) {
      detectedCommand = "gsc_qoq_pages";
    } else if (lowerQuery.includes("funnel") || lowerQuery.includes("conver") || lowerQuery.includes("admission")) {
      detectedCommand = "ga4_qoq_organic_funnel";
    } else {
      detectedCommand = "gsc_qoq_queries";
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
    gsc_qoq_queries: "GSC Query Performance (Quarter over Quarter)",
    gsc_qoq_pages: "GSC Page Performance (Quarter over Quarter)",
    ga4_qoq_organic_funnel: "GA4 Organic Funnel (Quarter over Quarter)",
    ga4_qoq_organic_landing_pages: "GA4 Organic Landing Pages (Quarter over Quarter)",
    callrail_qoq_organic_calls: "CallRail Organic Calls (Quarter over Quarter)",
    callrail_qoq_top_landing_pages: "CallRail Top Landing Pages (Quarter over Quarter)",
    ctm_qoq_organic_calls: "CTM Organic Calls (Quarter over Quarter)",
    ctm_qoq_top_landing_pages: "CTM Top Landing Pages (Quarter over Quarter)",
    ahrefs_backlink_overview: "Ahrefs Backlink Overview",
    ahrefs_keyword_rankings: "Ahrefs Keyword Rankings",
    semrush_organic_overview: "SEMrush Organic Overview",
    semrush_keyword_rankings: "SEMrush Keyword Rankings",
  };
  return descriptions[command];
}

export function getDateRangeLabel(dateRange: string): string {
  const labels: Record<string, string> = {
    last_90_vs_prev_90: "Last 90 Days vs Previous 90 Days",
    last_30_vs_prev_30: "Last 30 Days vs Previous 30 Days",
    last_365_vs_prev_365: "Last 365 Days vs Previous 365 Days",
  };
  return labels[dateRange] || dateRange;
}
