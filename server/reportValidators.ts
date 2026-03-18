/**
 * Report Readiness Validators
 *
 * Actual blocking/partial-render logic for all 7 report types.
 * Each validator returns a typed result object showing:
 *   - required sources present/missing
 *   - optional sources present/missing
 *   - blocking conditions (hard stop — report cannot render meaningful data)
 *   - partial conditions (report renders but some slides degrade to placeholder)
 *   - the UI behavior for each condition
 *
 * Consumed by routes.ts for pre-generation checks and by the frontend
 * SourceReadinessBanner component.
 */

import type { Client } from "@shared/schema";

export type SourceStatus = "connected" | "missing_required" | "missing_optional";

export interface SourceCheck {
  source: string;
  field: string;
  status: SourceStatus;
  label: string;
  usedBy: string[];
}

export interface BlockingCondition {
  condition: string;
  missingField: string;
  consequence: string;
  uiBehavior: string;
}

export interface PartialCondition {
  condition: string;
  missingField: string;
  consequence: string;
  slidesAffected: string[];
  fallback: string;
}

export interface ValidatorResult {
  report: string;
  canRender: boolean;
  blockingConditions: BlockingCondition[];
  partialConditions: PartialCondition[];
  sourceChecks: SourceCheck[];
  warningMessages: string[];
}

// ─── Discoverability Tool ─────────────────────────────────────────────────────

export function validateDiscoverability(client: Client): ValidatorResult {
  const blocks: BlockingCondition[] = [];
  const partials: PartialCondition[] = [];
  const sources: SourceCheck[] = [];
  const warnings: string[] = [];

  // Business Profile is stored per-workspace, not on the client — always
  // renderable from AI alone, but live data improves grounding quality.

  // GSC
  sources.push({
    source: "Google Search Console",
    field: "gscSiteUrl",
    status: client.gscSiteUrl ? "connected" : "missing_optional",
    label: "GSC — current query positions (liveContext grounding)",
    usedBy: ["Keyword AI grounding: top 30 current queries with pos+clicks"],
  });

  // Ahrefs
  sources.push({
    source: "Ahrefs",
    field: "ahrefsProjectUrl",
    status: (client as any).ahrefsProjectUrl ? "connected" : "missing_optional",
    label: "Ahrefs — keyword volume + KD (only confirmed source)",
    usedBy: ["searchVolume field", "kd field", "clientCurrentPosition (positionSource=Ahrefs)"],
  });

  // SEMrush
  sources.push({
    source: "SEMrush",
    field: "semrushProjectId",
    status: (client as any).semrushProjectId ? "connected" : "missing_optional",
    label: "SEMrush — keyword distribution by position bucket",
    usedBy: ["AI grounding: position group distribution"],
  });

  if (!client.gscSiteUrl && !(client as any).ahrefsProjectUrl && !(client as any).semrushProjectId) {
    warnings.push(
      "No live data sources connected. AI will generate keywords from business profile only. " +
      "searchVolume and kd will be null for all keywords. clientCurrentPosition will be null."
    );
  }

  if (!(client as any).ahrefsProjectUrl) {
    partials.push({
      condition: "Ahrefs not configured",
      missingField: "ahrefsProjectUrl",
      consequence: "searchVolume and kd will be null (shown as '—') for all AI-generated keywords",
      slidesAffected: ["keyword table — Volume column", "keyword table — KD column"],
      fallback: "Columns display '—' with tooltip 'Connect Ahrefs to see search volume'",
    });
  }

  if (!client.gscSiteUrl) {
    partials.push({
      condition: "GSC not configured",
      missingField: "gscSiteUrl",
      consequence: "clientCurrentPosition will be null; AI has no current ranking data to ground against",
      slidesAffected: ["keyword table — Position column", "AI keyword suggestions accuracy"],
      fallback: "Position column shows '—'; AI generates from business profile only",
    });
  }

  return {
    report: "Discoverability Tool",
    canRender: true,
    blockingConditions: blocks,
    partialConditions: partials,
    sourceChecks: sources,
    warningMessages: warnings,
  };
}

// ─── Bi-Weekly Report ─────────────────────────────────────────────────────────

export function validateBiweekly(client: Client): ValidatorResult {
  const blocks: BlockingCondition[] = [];
  const partials: PartialCondition[] = [];
  const sources: SourceCheck[] = [];
  const warnings: string[] = [];

  // NSM Sheet (Google Sheets via Replit connector)
  sources.push({
    source: "NSM Goals Sheet",
    field: "nsmSheetConnected",
    status: "missing_optional",
    label: "Google Sheets — NSM quarterly goals (sessions, MVP metric)",
    usedBy: ["Performance Pulse section: NSM sessions goal/actual/%, MVP goal/actual/%"],
  });

  // Airtable
  sources.push({
    source: "Airtable",
    field: "airtableBaseId",
    status: (client as any).airtableBaseId ? "connected" : "missing_optional",
    label: "Airtable — published content work log",
    usedBy: ["Progress & Quick Wins: Content row (What We Did)", "Optimization row"],
  });
  if (!(client as any).airtableBaseId) {
    partials.push({
      condition: "Airtable not configured",
      missingField: "airtableBaseId",
      consequence: "Content and Optimization rows empty in Progress section",
      slidesAffected: ["bw_progress — Content row", "bw_progress — Optimization row"],
      fallback: "Shows 'No content published this period.' placeholder",
    });
  }

  // Asana
  sources.push({
    source: "Asana",
    field: "asanaProjectId",
    status: (client as any).asanaProjectId ? "connected" : "missing_optional",
    label: "Asana — completed and upcoming task log",
    usedBy: ["Progress & Quick Wins: Technical SEO row", "Local SEO row", "What's Next items"],
  });
  if (!(client as any).asanaProjectId) {
    partials.push({
      condition: "Asana not configured",
      missingField: "asanaProjectId",
      consequence: "Technical SEO and Local SEO rows use SF-derived priorities only",
      slidesAffected: ["bw_progress — Technical SEO row", "bw_progress — Local SEO row"],
      fallback: "Screaming Frog priorities used if SF report exists; else estimated fallbacks",
    });
  }

  // Screaming Frog — uploaded, not via integration
  sources.push({
    source: "Screaming Frog",
    field: "sfReport (uploaded)",
    status: "missing_optional",
    label: "Screaming Frog crawl upload — technical issue counts",
    usedBy: ["Technical SEO row: canonical/404/image/meta counts", "SF snapshot delta"],
  });
  partials.push({
    condition: "No Screaming Frog crawl uploaded",
    missingField: "sfReports (none in DB)",
    consequence: "Technical priorities are estimated from hardcoded fallback bullets",
    slidesAffected: ["bw_progress — Technical SEO row — What's Next"],
    fallback: "Fallback: 'Review Core Web Vitals...' / 'Identify duplicate content...'",
  });

  // Note: Biweekly does NOT use GSC, GA4, or any call tracker
  warnings.push(
    "Bi-Weekly report does NOT pull GSC, GA4, or call tracking data. " +
    "All performance metrics come from NSM Sheet (Google Sheets). " +
    "Work log comes from Airtable + Asana. Technical SEO from Screaming Frog upload."
  );

  return {
    report: "Bi-Weekly",
    canRender: true,
    blockingConditions: blocks,
    partialConditions: partials,
    sourceChecks: sources,
    warningMessages: warnings,
  };
}

// ─── Monthly Report ───────────────────────────────────────────────────────────

export function validateMonthly(client: Client): ValidatorResult {
  const blocks: BlockingCondition[] = [];
  const partials: PartialCondition[] = [];
  const sources: SourceCheck[] = [];
  const warnings: string[] = [];

  // GSC
  sources.push({
    source: "Google Search Console",
    field: "gscSiteUrl",
    status: client.gscSiteUrl ? "connected" : "missing_required",
    label: "GSC — organic queries + pages",
    usedBy: [
      "Slide 2: Total Clicks, Total Impressions summary metrics",
      "Slide 3: Top Organic Queries table (query, clicks, Δclicks, impressions, CTR, position)",
      "Slide 3b: Query Groups topic clustering (200 queries)",
      "Slide 5: Top Landing Pages (clicks, Δclicks, impressions, Δimpressions, CTR, position)",
      "Slide 6: Top Pages by Clicks bar chart",
      "Slide 9 (gsc_daily_trend): Daily clicks+impressions trend chart",
    ],
  });
  if (!client.gscSiteUrl) {
    blocks.push({
      condition: "GSC not configured",
      missingField: "gscSiteUrl",
      consequence: "Slides 3, 3b, 5, 6, daily trend all fall back to 'Manual entry needed'",
      uiBehavior: "Report generates with placeholder rows; SourceReadinessBanner shows amber GSC chip",
    });
  }

  // GA4
  sources.push({
    source: "Google Analytics 4",
    field: "ga4PropertyId",
    status: client.ga4PropertyId ? "connected" : "missing_required",
    label: "GA4 — organic sessions, conversions, CVR",
    usedBy: [
      "Slide 2: Organic Sessions, Organic Conversions, Organic CVR (ga4_qoq_organic_funnel)",
      "Slide 4: QTD Organic Sessions + QTD Organic Conversions/Leads",
      "Slide 5 (fallback): Top Landing Pages by Sessions when GSC unavailable",
      "Slide 9 (ga4_daily_trend): Daily sessions+engaged trend chart",
    ],
  });
  if (!client.ga4PropertyId) {
    blocks.push({
      condition: "GA4 not configured",
      missingField: "ga4PropertyId",
      consequence: "Slide 2 shows 'Manual entry needed' for sessions/conversions; Slide 4 QTD values are empty",
      uiBehavior: "Report generates with placeholder values; performance slide incomplete",
    });
  }

  // Call Tracking — CallRail OR CTM
  const hasCallRail = !!client.callrailCompanyId;
  const hasCtm = !!(client as any).ctmAccountId;
  const hasAnyCallTracking = hasCallRail || hasCtm;

  sources.push({
    source: "CallRail",
    field: "callrailCompanyId",
    status: hasCallRail ? "connected" : "missing_optional",
    label: "CallRail — organic call count + source breakdown",
    usedBy: [
      "Slide 2: Total Calls (callrail_qoq_organic_calls)",
      "Slide 2b: Top Conversion Sources table (callrail_summary → calls by source)",
      "Slide 4: QTD Calls (callrail_qoq_organic_calls QTD window)",
    ],
  });

  sources.push({
    source: "CallTrackingMetrics",
    field: "ctmAccountId",
    status: hasCtm ? "connected" : "missing_optional",
    label: "CTM — organic call count [Monthly generator does NOT route CTM — BUG]",
    usedBy: [
      "CURRENTLY UNROUTED: Monthly generator imports only queryCallRail, not queryCtm",
      "BUG: CTM clients get 'Manual entry needed' for all call slides even when ctmAccountId is set",
    ],
  });

  if (!hasAnyCallTracking) {
    partials.push({
      condition: "No call tracker configured",
      missingField: "callrailCompanyId + ctmAccountId both absent",
      consequence: "Slide 2 call metric is empty; Slide 2b (Top Conversion Sources) not generated; Slide 4 QTD Calls is 'Manual entry needed'",
      slidesAffected: ["performance", "conversion_sources", "qtd_kpi — Qualified Calls row"],
      fallback: "Placeholder text 'Manual entry needed'",
    });
  }

  if (hasCtm && !hasCallRail) {
    blocks.push({
      condition: "Client uses CTM but Monthly generator does not import queryCtm",
      missingField: "queryCtm import in monthlyGenerator.ts",
      consequence: "All call slides show 'Manual entry needed' despite CTM being configured",
      uiBehavior: "BUG — fix requires adding CTM routing to parallel fetch block in generateMonthly()",
    });
  }

  // SEMrush
  sources.push({
    source: "SEMrush",
    field: "semrushProjectId",
    status: (client as any).semrushProjectId ? "connected" : "missing_optional",
    label: "SEMrush — keyword visibility distribution (position buckets)",
    usedBy: [
      "Slide 7: Keyword Visibility Distribution (semrush_keyword_distribution, ~30-day rolling window)",
    ],
  });
  if (!(client as any).semrushProjectId) {
    partials.push({
      condition: "SEMrush not configured",
      missingField: "semrushProjectId",
      consequence: "Slide 7 falls back to 'Manual entry needed'",
      slidesAffected: ["keywords"],
      fallback: "Table with placeholder row",
    });
  }

  // Airtable
  sources.push({
    source: "Airtable",
    field: "airtableBaseId",
    status: (client as any).airtableBaseId ? "connected" : "missing_optional",
    label: "Airtable — published content work log",
    usedBy: ["Slide 8: Work Completed — Content type rows"],
  });

  // Asana
  sources.push({
    source: "Asana",
    field: "asanaProjectId",
    status: (client as any).asanaProjectId ? "connected" : "missing_optional",
    label: "Asana — completed/upcoming tasks by category",
    usedBy: ["Slide 8: Work Completed", "Slide 8b: Supporting Strategic Initiatives", "Slide 9: Next Month Priorities"],
  });

  // NSM Sheet
  sources.push({
    source: "NSM Goals Sheet",
    field: "nsmSheetConnected",
    status: "missing_optional",
    label: "Google Sheets — quarterly sessions + MVP goal",
    usedBy: ["Slide 4: QTD KPI — Goal column + % to Goal + Status"],
  });

  return {
    report: "Monthly",
    canRender: true,
    blockingConditions: blocks,
    partialConditions: partials,
    sourceChecks: sources,
    warningMessages: warnings,
  };
}

// ─── QBS (QBR Prep) ───────────────────────────────────────────────────────────

export function validateQbs(client: Client): ValidatorResult {
  const blocks: BlockingCondition[] = [];
  const partials: PartialCondition[] = [];
  const sources: SourceCheck[] = [];
  const warnings: string[] = [];

  sources.push({
    source: "Google Search Console",
    field: "gscSiteUrl",
    status: client.gscSiteUrl ? "connected" : "missing_required",
    label: "GSC — page-level + query-level performance (500 rows each)",
    usedBy: [
      "Top gaining / declining pages detection (page-level delta)",
      "High impressions / low CTR opportunity detection",
      "Branded vs non-brand query split (brandTerms array)",
      "Content opportunity analysis (query gaps)",
    ],
  });
  if (!client.gscSiteUrl) {
    blocks.push({
      condition: "GSC not configured",
      missingField: "gscSiteUrl",
      consequence: "Content opportunities, top gaining/declining pages, and query analysis all empty",
      uiBehavior: "AI generates placeholder opportunities without GSC evidence",
    });
  }

  sources.push({
    source: "Google Analytics 4",
    field: "ga4PropertyId",
    status: client.ga4PropertyId ? "connected" : "missing_required",
    label: "GA4 — quarterly organic sessions, conversions, landing page performance",
    usedBy: [
      "Funnel performance (sessions, conversions, CVR for past quarter + prev quarter)",
      "Landing page: sessions, conversions, avgDuration, engagementRate, bounceRate",
      "Device breakdown: sessions + engagementRate by device + page",
      "CRO opportunity detection (low engagement rate, high bounce rate pages)",
    ],
  });
  if (!client.ga4PropertyId) {
    blocks.push({
      condition: "GA4 not configured",
      missingField: "ga4PropertyId",
      consequence: "CRO opportunities, funnel summary, and device breakdown unavailable",
      uiBehavior: "CRO and Tracking sections rely on AI fallback without real engagement data",
    });
  }

  sources.push({
    source: "Screaming Frog",
    field: "sfReport (uploaded)",
    status: "missing_optional",
    label: "Screaming Frog crawl — technical issue detection",
    usedBy: [
      "Technical opportunity detection: 404s, canonical conflicts, missing meta, image sizes",
      "Crawl format detection: Internal All row-level vs Crawl Overview summary format",
    ],
  });
  partials.push({
    condition: "No Screaming Frog crawl uploaded",
    missingField: "sfReports (none in DB)",
    consequence: "Technical opportunities use estimated/generic priorities only",
    slidesAffected: ["Technical category in opportunity backlog"],
    fallback: "sfAvailable=false → technical opportunities generated from GSC data only",
  });

  const hasCallRail = !!client.callrailCompanyId;
  const hasCtm = !!(client as any).ctmAccountId;
  sources.push({
    source: "CallRail / CTM",
    field: "callrailCompanyId / ctmAccountId",
    status: (hasCallRail || hasCtm) ? "connected" : "missing_optional",
    label: "Call tracking — call volume for Tracking opportunities",
    usedBy: ["callTrackingAvailable flag gates Tracking opportunity category"],
  });

  warnings.push(
    "QBR Prep uses its own inline gscFetch()/ga4Fetch() functions — not the shared queryGsc/queryGa4 wrappers. " +
    "This means brandTerms filtering for non-brand split is implemented separately from gscClient.ts."
  );

  return {
    report: "QBS (QBR Prep)",
    canRender: true,
    blockingConditions: blocks,
    partialConditions: partials,
    sourceChecks: sources,
    warningMessages: warnings,
  };
}

// ─── QBR (Full) ───────────────────────────────────────────────────────────────

export function validateQbr(client: Client): ValidatorResult {
  const blocks: BlockingCondition[] = [];
  const partials: PartialCondition[] = [];
  const sources: SourceCheck[] = [];
  const warnings: string[] = [];

  sources.push({
    source: "Google Search Console",
    field: "gscSiteUrl",
    status: client.gscSiteUrl ? "connected" : "missing_required",
    label: "GSC — same as QBS but used in QBR full generator",
    usedBy: ["Same routing as qbrPrepGenerator.ts"],
  });

  sources.push({
    source: "Google Analytics 4",
    field: "ga4PropertyId",
    status: client.ga4PropertyId ? "connected" : "missing_required",
    label: "GA4 — quarterly performance",
    usedBy: ["Same routing as qbrPrepGenerator.ts"],
  });

  warnings.push(
    "QBR Full (qbrFullGenerator.ts) shares data-fetching patterns with QBS but is a separate generator. " +
    "Verify that qbrFullGenerator.ts has the same source routing as qbrPrepGenerator.ts."
  );

  return {
    report: "QBR (Full)",
    canRender: true,
    blockingConditions: blocks,
    partialConditions: partials,
    sourceChecks: sources,
    warningMessages: warnings,
  };
}

// ─── Mid-Strategy Deck ────────────────────────────────────────────────────────

export function validateMidStrategy(client: Client, evalBatchId?: number): ValidatorResult {
  const blocks: BlockingCondition[] = [];
  const partials: PartialCondition[] = [];
  const sources: SourceCheck[] = [];
  const warnings: string[] = [];

  if (!evalBatchId) {
    blocks.push({
      condition: "No evaluation batch selected",
      missingField: "evalBatchId",
      consequence: "Entire deck cannot render — no competitor data",
      uiBehavior: "Generate button disabled; user must select an eval batch",
    });
  }

  sources.push({
    source: "Ahrefs",
    field: "ahrefsProjectUrl (stored in evalBatch competitor rows)",
    status: "missing_optional",
    label: "Ahrefs — DR, referringDomains, backlinks, organicTraffic, organicKeywords, top10Keywords",
    usedBy: [
      "Slide 4 (comp_analysis): DR rank, backlinks, RD, indexed pages",
      "Slide 5: organicKeywords, top10Keywords, contentYield",
      "Slide 7: averageRank/percentile across all metrics",
      "computeRanks(): descMetrics list ranks all Ahrefs fields desc",
    ],
  });

  sources.push({
    source: "SEMrush",
    field: "semrushProjectId (stored in evalBatch competitor rows)",
    status: "missing_optional",
    label: "SEMrush — aiVisibilityScore, aiMentions, citedSources, informationalKeywords, featuredSnippets, indexedPages",
    usedBy: [
      "Slide 6 (comp_analysis): AI Visibility Score, AI mentions, mention rate",
      "informationalDensity derived metric",
      "indexedPages (SEMrush Pc column as fallback to SF upload)",
    ],
  });

  sources.push({
    source: "Screaming Frog upload",
    field: "sfReport (per evalBatch)",
    status: "missing_optional",
    label: "Screaming Frog — indexed pages (preferred over SEMrush Pc)",
    usedBy: ["indexedPages metric — SF is priority source, SEMrush Pc is fallback"],
  });

  sources.push({
    source: "WHOIS",
    field: "domain (web_retrieval)",
    status: "missing_optional",
    label: "WHOIS — domain registration date → age calculation",
    usedBy: [
      "age derived metric = today - whoisReg (years)",
      "kwVelocity = organicKeywords / age",
      "snippetVelocity = featuredSnippets / age",
      "rdVelocity = referringDomains / age",
      "contentVelocity = indexedPages / age",
    ],
  });

  sources.push({
    source: "Wayback Machine",
    field: "domain (web_retrieval)",
    status: "missing_optional",
    label: "Wayback Machine — first archive date → archiveAge",
    usedBy: ["archiveAge derived metric"],
  });

  sources.push({
    source: "GSC + GA4 per crawl row",
    field: "gscSiteUrl + ga4PropertyId (joined to crawl rows)",
    status: (client.gscSiteUrl && client.ga4PropertyId) ? "connected" : "missing_optional",
    label: "GSC + GA4 performance fields joined to crawler row by page URL",
    usedBy: [
      "Slide 8 (clicks_dist): buildClicksDistribution() — gscClicks per page category",
      "Slide 9 (traffic_dist): buildTrafficDistribution() — ga4Sessions per page category",
      "clicksPerPage = sumClicks / numPages per category",
      "shareOfClicks = sumClicks / totalClicks per category",
      "sessionsPerPage = sumSessions / numPages per category",
      "shareOfSessions = sumSessions / totalSessions per category",
    ],
  });

  warnings.push(
    "Mid-Strategy deck uses evalDataCollector.ts deterministic formulas exclusively — " +
    "no AI is used to fill metric fields. All velocity/yield/density metrics are " +
    "computed from raw metric values via computeDerivedMetrics()."
  );
  warnings.push(
    "Page category assignment uses classifyUrl() from evalMetricRegistry.ts with DEFAULT_CATEGORY_RULES. " +
    "Homepage concentration is detectable via category='Homepage' in clicks_dist/traffic_dist tables."
  );

  return {
    report: "Mid-Strategy Deck",
    canRender: !evalBatchId ? false : true,
    blockingConditions: blocks,
    partialConditions: partials,
    sourceChecks: sources,
    warningMessages: warnings,
  };
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export function validateDashboard(client: Client): ValidatorResult {
  const blocks: BlockingCondition[] = [];
  const partials: PartialCondition[] = [];
  const sources: SourceCheck[] = [];
  const warnings: string[] = [];

  sources.push({
    source: "Google Search Console",
    field: "gscSiteUrl",
    status: client.gscSiteUrl ? "connected" : "missing_optional",
    label: "GSC — clicks, impressions for this month + trend",
    usedBy: ["Search group: Organic Clicks, Organic Impressions metric cards"],
  });

  sources.push({
    source: "Google Analytics 4",
    field: "ga4PropertyId",
    status: client.ga4PropertyId ? "connected" : "missing_optional",
    label: "GA4 — organic sessions, conversions",
    usedBy: ["Traffic group: Organic Sessions, Organic Conversions metric cards"],
  });

  const hasCallRail = !!client.callrailCompanyId;
  const hasCtm = !!(client as any).ctmAccountId;
  const hasNimbata = !!(client as any).nimbataAccountId;

  sources.push({
    source: "CallRail",
    field: "callrailCompanyId",
    status: hasCallRail ? "connected" : "missing_optional",
    label: "CallRail — total calls this month",
    usedBy: ["Calls group: Total Calls metric card; callProvider='CallRail' badge"],
  });
  sources.push({
    source: "CallTrackingMetrics",
    field: "ctmAccountId",
    status: hasCtm ? "connected" : "missing_optional",
    label: "CTM — total calls this month",
    usedBy: ["Calls group: Total Calls metric card; callProvider='CTM' badge"],
  });
  sources.push({
    source: "Nimbata",
    field: "nimbataAccountId",
    status: hasNimbata ? "connected" : "missing_optional",
    label: "Nimbata — [NO CLIENT EXISTS — badge only, data not fetched]",
    usedBy: ["callProvider='Nimbata' badge shown but no queryNimbata client exists"],
  });

  if (hasNimbata) {
    blocks.push({
      condition: "Nimbata configured but no query client exists",
      missingField: "server/nimbataClient.ts (does not exist)",
      consequence: "Dashboard shows Nimbata badge but calls metric card shows no data",
      uiBehavior: "Badge shown; metric card displays empty or prior provider data",
    });
  }

  warnings.push(
    "Dashboard call data is the only place in the platform where all three call providers " +
    "compete for the same metric card slot. Provider priority order: CallRail > CTM > Nimbata."
  );

  return {
    report: "Dashboard",
    canRender: true,
    blockingConditions: blocks,
    partialConditions: partials,
    sourceChecks: sources,
    warningMessages: warnings,
  };
}
