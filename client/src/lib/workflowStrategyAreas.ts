import type { ReportFamily } from "@shared/reportRegistry";

export interface StrategyArea {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly inputPrompt: string;
  readonly mockQuestions: readonly string[];
  readonly mockFindings: readonly string[];
}

export const DEFAULT_STRATEGY_AREAS = [
  {
    id: "content_refresh",
    label: "Content Refresh",
    description: "Existing pages that need updates, rewrites, or consolidation.",
    inputPrompt:
      "Which pages have you flagged for refresh? Any decline signals, keyword cannibalization, or content staleness to note?",
    mockQuestions: [
      "Are there specific URLs you've already identified as underperforming based on GSC position drops?",
      "Has any content been refreshed in the past 6 months that we should avoid re-touching?",
    ],
    mockFindings: [
      "3–5 informational pages showing 15–30% YoY click decline — recommend rewrites.",
      "2 cluster pillar pages with thin body content — recommend depth expansion.",
      "Keyword cannibalization detected in service-type taxonomy — consolidation recommended.",
    ],
  },
  {
    id: "new_content",
    label: "New Content",
    description: "Net-new pages targeting identified keyword gaps or service expansion.",
    inputPrompt:
      "What are the main content gaps or new service areas the client is trying to rank for? Any specific keyword clusters or competitor pages to target?",
    mockQuestions: [
      "Is the client open to cluster-style content (hub + spokes) or focused on single high-intent pages?",
      "Are there geographic expansion targets or new service lines launching this quarter?",
    ],
    mockFindings: [
      "Keyword gap analysis shows 12 mid-funnel queries with DR <40 competitors — opportunity for new cluster pages.",
      "Client is missing a page for a high-intent specialty service keyword — competitor foothold identified.",
      "Recommended: 2–3 new geo-modifier or service-qualifier landing pages based on GSC impression data.",
    ],
  },
  {
    id: "cro_content",
    label: "CRO Content",
    description: "Conversion-focused edits: CTAs, page flow, trust signals, form optimization.",
    inputPrompt:
      "Which pages have the highest organic traffic but lowest conversion rates? Any specific friction points the team has observed?",
    mockQuestions: [
      "Are there specific form types or lead events we should prioritize improving?",
      "Has the client expressed concerns about any specific page's bounce rate or exit rate?",
    ],
    mockFindings: [
      "Homepage has no above-the-fold CTA — recommend adding a primary conversion action (contact, inquiry, or lead-gen button).",
      "Primary conversion page has high avg. time-on-page but low conversion rate — CTA placement review needed.",
      "3 key landing pages lack a live chat or callback widget — recommend adding a real-time conversion mechanism.",
    ],
  },
  {
    id: "technical_infra",
    label: "Technical Infrastructure",
    description: "Core Web Vitals, crawl budget, site architecture, indexability.",
    inputPrompt:
      "Any known technical issues from the Screaming Frog crawl, GSC coverage errors, or Core Web Vitals alerts? Any site migrations or CMS changes pending?",
    mockQuestions: [
      "Has there been any major site change (redesign, migration, CMS change) in the last 6 months?",
      "Are there any known redirect chains or soft 404s that haven't been resolved?",
    ],
    mockFindings: [
      "14 pages with non-canonical crawl paths — redirect logic review recommended.",
      "LCP score averaging 4.2s on mobile — image optimization and render-blocking resource audit needed.",
      "Crawl budget being consumed by faceted navigation parameters — robots.txt or noindex directives recommended.",
    ],
  },
  {
    id: "technical_content",
    label: "Technical Content",
    description: "On-page optimization, title/meta alignment, schema markup, internal linking.",
    inputPrompt:
      "Are there pages with missing or misaligned title tags, poor internal linking, or missing schema? Any structured data opportunities tied to client service types?",
    mockQuestions: [
      "Has the client implemented FAQ or HowTo schema anywhere? Should we expand it?",
      "Are there any pages ranking in positions 8–15 that could benefit from on-page optimization alone?",
    ],
    mockFindings: [
      "8 pages with title tags over 65 characters — truncation in SERP likely reducing CTR.",
      "Internal linking structure is shallow — most conversion pages have fewer than 3 internal links pointing to them.",
      "FAQ schema missing across informational cluster — quick win for featured snippet eligibility.",
    ],
  },
  {
    id: "advanced_technical",
    label: "Advanced Technical",
    description: "JavaScript rendering, log file analysis, international SEO, advanced crawl issues.",
    inputPrompt:
      "Any advanced technical flags: JS-rendered content, crawl anomalies from log analysis, hreflang issues, or international targeting concerns?",
    mockQuestions: [
      "Is the client's site JS-rendered? Have we validated Googlebot's rendering of key pages?",
      "Do we have server log file access for crawl pattern analysis?",
    ],
    mockFindings: [
      "Googlebot is not rendering key sections of the page — these are JS-rendered and may be invisible to search engines.",
      "Log analysis shows Googlebot recrawl frequency drops on paginated content — may be under-indexed.",
      "No advanced technical blockers identified outside the above — standard monitoring recommended.",
    ],
  },
  {
    id: "local_gbp",
    label: "Local / GBP / Location",
    description: "Google Business Profile health, local signals, map pack visibility, location pages.",
    inputPrompt:
      "What's the current state of the GBP profile? Any map pack visibility issues, review velocity concerns, or location page gaps?",
    mockQuestions: [
      "Is the client actively managing their GBP posts and Q&A section?",
      "Are there any satellite location pages needed that don't currently exist on the site?",
    ],
    mockFindings: [
      "GBP profile is complete but has 0 new posts in 60 days — recommend a regular post cadence.",
      "Map pack visibility is inconsistent for key target queries — citation audit may uncover NAP inconsistencies.",
      "Location page for primary city ranks on page 2 — on-page and link building focus recommended.",
    ],
  },
  {
    id: "discoverability",
    label: "Discoverability / AI Retrieval",
    description: "Structured data, entity coverage, AI-readiness, topical authority signals.",
    inputPrompt:
      "Any observations about AI overview appearances, entity coverage, or topical authority gaps? Has the client been showing up in AI-generated answers?",
    mockQuestions: [
      "Has the client expressed interest in optimizing for AI overviews or AI-assisted search citations?",
      "Is there an entity definition page (About, brand page) that clearly defines the organization for knowledge graph purposes?",
    ],
    mockFindings: [
      "Client lacks a structured 'About' or brand entity page — limits knowledge graph recognition.",
      "No Organization schema on the homepage — recommend implementation for entity recognition and AI retrieval signals.",
      "Topical authority is strong in the client's core service area but thin in adjacent topic clusters — content expansion opportunity.",
    ],
  },
] as const;

export type StrategyAreaId = (typeof DEFAULT_STRATEGY_AREAS)[number]["id"];

export function getStrategyAreas(_reportFamily?: ReportFamily): typeof DEFAULT_STRATEGY_AREAS {
  return DEFAULT_STRATEGY_AREAS;
}
