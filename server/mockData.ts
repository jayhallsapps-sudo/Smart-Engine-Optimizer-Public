import type { Command, CommandResult } from "@shared/schema";

function randomDelta(base: number, variance: number): number {
  return Math.round(base + (Math.random() - 0.5) * variance * 2);
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function formatDelta(current: number, previous: number): { delta: string; deltaPercent: string; isPositive: boolean } {
  const diff = current - previous;
  const pct = previous !== 0 ? (diff / previous) * 100 : 0;
  return {
    delta: `${diff >= 0 ? "+" : ""}${diff.toLocaleString()}`,
    deltaPercent: formatPercent(pct),
    isPositive: diff >= 0,
  };
}

export function generateMockResult(command: Command, clientName: string, dateRange: string): CommandResult {
  switch (command) {
    case "gsc_qoq_queries": return generateGscQueries(clientName, dateRange);
    case "gsc_qoq_pages": return generateGscPages(clientName, dateRange);
    case "gsc_top_queries": return generateGscTopQueries(clientName, dateRange);
    case "gsc_query_to_page_map": return generateGscQueryToPage(clientName, dateRange);
    case "gsc_high_impressions_low_ctr": return generateHighImpressionsLowCtr(clientName, dateRange);
    case "gsc_high_traffic_low_cvr": return generateHighTrafficLowCvr(clientName, dateRange);
    case "gsc_indexation_stability": return generateIndexationStability(clientName, dateRange);
    case "ga4_qoq_organic_funnel": return generateGa4Funnel(clientName, dateRange);
    case "ga4_qoq_organic_landing_pages": return generateGa4LandingPages(clientName, dateRange);
    case "ga4_combined_funnel": return generateCombinedFunnel(clientName, dateRange);
    case "ga4_qtd_totals": return generateQtdTotals(clientName, dateRange);
    case "ga4_landing_pages_by_sessions": return generateLandingPagesBySessions(clientName, dateRange);
    case "ga4_landing_pages_by_conversions": return generateLandingPagesByConversions(clientName, dateRange);
    case "ga4_session_movers": return generateSessionMovers(clientName, dateRange);
    case "ga4_conversion_movers": return generateConversionMovers(clientName, dateRange);
    case "ga4_yoy_comparison": return generateYoyComparison(clientName, dateRange);
    case "callrail_qoq_organic_calls": return generateCallCalls(clientName, dateRange, "callrail_qoq_organic_calls");
    case "callrail_qoq_top_landing_pages": return generateCallLandingPages(clientName, dateRange, "callrail_qoq_top_landing_pages");
    case "callrail_summary": return generateCallrailSummary(clientName, dateRange);
    case "ctm_qoq_organic_calls": return generateCallCalls(clientName, dateRange, "ctm_qoq_organic_calls");
    case "ctm_qoq_top_landing_pages": return generateCallLandingPages(clientName, dateRange, "ctm_qoq_top_landing_pages");
    case "ahrefs_backlink_overview": return generateAhrefsBacklinks(clientName, dateRange);
    case "ahrefs_keyword_rankings": return generateAhrefsKeywords(clientName, dateRange);
    case "ahrefs_competitor_visibility": return generateCompetitorVisibility(clientName, dateRange, "ahrefs");
    case "semrush_organic_overview": return generateSemrushOverview(clientName, dateRange);
    case "semrush_keyword_rankings": return generateSemrushKeywords(clientName, dateRange);
    case "semrush_keyword_distribution": return generateKeywordDistribution(clientName, dateRange);
    case "semrush_competitor_visibility": return generateCompetitorVisibility(clientName, dateRange, "semrush");
    case "content_output_summary": return generateContentOutputSummary(clientName, dateRange);
    case "technical_health_summary": return generateTechnicalHealthSummary(clientName, dateRange);
    case "core_web_vitals": return generateCoreWebVitals(clientName, dateRange);
    case "gbp_local_summary": return generateGbpLocalSummary(clientName, dateRange);
    case "new_pages_tracker": return generateNewPagesTracker(clientName, dateRange);
    case "tracking_anomaly_check": return generateTrackingAnomalyCheck(clientName, dateRange);
    case "monthly_trendline": return generateMonthlyTrendline(clientName, dateRange);
    case "quarterly_forecast": return generateQuarterlyForecast(clientName, dateRange);
    case "airtable_work_log": return generateWorkLogPlaceholder(clientName, dateRange);
  }
}

function generateGscQueries(clientName: string, dateRange: string): CommandResult {
  const currentClicks = randomDelta(12400, 3000);
  const prevClicks = randomDelta(10800, 2500);
  const currentImpressions = randomDelta(485000, 50000);
  const prevImpressions = randomDelta(420000, 45000);
  const currentCtr = Number(((currentClicks / currentImpressions) * 100).toFixed(2));
  const prevCtr = Number(((prevClicks / prevImpressions) * 100).toFixed(2));

  const winnerQueries = [
    "drug rehab near me", "alcohol treatment center", "addiction recovery programs",
    "detox center", "inpatient rehab", "outpatient addiction treatment",
    "substance abuse help", "rehab for alcoholism", "drug addiction treatment",
    "best rehab centers", "mental health and addiction", "dual diagnosis treatment",
    "sober living homes", "medication assisted treatment", "opioid addiction treatment",
    "insurance for rehab", "free rehab centers", "luxury rehab",
    "family therapy addiction", "intervention specialist",
  ];

  const loserQueries = [
    "12 step program near me", "aa meetings", "na meetings online",
    "addiction counselor", "rehab cost", "how to help an addict",
    "signs of addiction", "withdrawal symptoms", "relapse prevention",
    "group therapy addiction", "cbt for addiction", "holistic rehab",
    "teen rehab programs", "veteran rehab", "women's rehab center",
    "faith based rehab", "court ordered rehab", "rehab success rates",
    "aftercare programs", "addiction hotline",
  ];

  const winnersRows = winnerQueries.map((q) => {
    const cc = randomDelta(600, 300);
    const pc = randomDelta(400, 200);
    return [q, cc, pc, cc - pc, formatPercent(((cc - pc) / Math.max(pc, 1)) * 100)];
  });

  const losersRows = loserQueries.map((q) => {
    const cc = randomDelta(200, 100);
    const pc = randomDelta(400, 150);
    return [q, cc, pc, cc - pc, formatPercent(((cc - pc) / Math.max(pc, 1)) * 100)];
  });

  const cd = formatDelta(currentClicks, prevClicks);
  const id = formatDelta(currentImpressions, prevImpressions);

  return {
    command: "gsc_qoq_queries",
    clientName, dateRange,
    summary: [
      { label: "Total Clicks", current: currentClicks.toLocaleString(), previous: prevClicks.toLocaleString(), ...cd },
      { label: "Total Impressions", current: currentImpressions.toLocaleString(), previous: prevImpressions.toLocaleString(), ...id },
      { label: "Avg CTR", current: `${currentCtr}%`, previous: `${prevCtr}%`, ...formatDelta(currentCtr, prevCtr) },
      { label: "Avg Position", current: "14.2", previous: "16.8", delta: "-2.6", deltaPercent: "-15.5%", isPositive: true },
    ],
    tables: [
      { title: "Top 20 Winners (by Clicks Delta)", headers: ["Query", "Current Clicks", "Previous Clicks", "Delta", "Change %"], rows: winnersRows },
      { title: "Top 20 Losers (by Clicks Delta)", headers: ["Query", "Current Clicks", "Previous Clicks", "Delta", "Change %"], rows: losersRows },
    ],
  };
}

function generateGscPages(clientName: string, dateRange: string): CommandResult {
  const currentClicks = randomDelta(15200, 4000);
  const prevClicks = randomDelta(13100, 3500);
  const cd = formatDelta(currentClicks, prevClicks);

  const pages = [
    "/programs/detox", "/programs/residential-treatment", "/programs/outpatient",
    "/programs/php-iop", "/insurance-verification", "/admissions",
    "/blog/signs-of-addiction", "/blog/what-to-expect-in-rehab", "/blog/family-support",
    "/treatment/alcohol", "/treatment/opioid", "/treatment/meth",
    "/treatment/cocaine", "/treatment/dual-diagnosis", "/about-us",
    "/contact", "/blog/relapse-prevention", "/programs/sober-living",
    "/blog/mental-health-addiction", "/testimonials",
  ];

  const winnersRows = pages.map((p) => {
    const cc = randomDelta(800, 400);
    const pc = randomDelta(550, 250);
    return [p, cc, pc, cc - pc, formatPercent(((cc - pc) / Math.max(pc, 1)) * 100)];
  });

  return {
    command: "gsc_qoq_pages",
    clientName, dateRange,
    summary: [
      { label: "Total Page Clicks", current: currentClicks.toLocaleString(), previous: prevClicks.toLocaleString(), ...cd },
      { label: "Pages with Growth", current: "142", previous: "118", ...formatDelta(142, 118) },
      { label: "Pages with Decline", current: "67", previous: "89", delta: "-22", deltaPercent: "-24.7%", isPositive: true },
    ],
    tables: [
      { title: "Top 20 Pages (by Clicks Delta)", headers: ["Page", "Current Clicks", "Previous Clicks", "Delta", "Change %"], rows: winnersRows },
    ],
  };
}

function generateGa4Funnel(clientName: string, dateRange: string): CommandResult {
  const currentSessions = randomDelta(28500, 5000);
  const prevSessions = randomDelta(24200, 4500);
  const currentUsers = randomDelta(21000, 4000);
  const prevUsers = randomDelta(18200, 3500);
  const currentConversions = randomDelta(420, 100);
  const prevConversions = randomDelta(360, 80);
  const currentCvr = Number(((currentConversions / currentSessions) * 100).toFixed(2));
  const prevCvr = Number(((prevConversions / prevSessions) * 100).toFixed(2));

  return {
    command: "ga4_qoq_organic_funnel",
    clientName, dateRange,
    summary: [
      { label: "Organic Sessions", current: currentSessions.toLocaleString(), previous: prevSessions.toLocaleString(), ...formatDelta(currentSessions, prevSessions) },
      { label: "Total Users", current: currentUsers.toLocaleString(), previous: prevUsers.toLocaleString(), ...formatDelta(currentUsers, prevUsers) },
      { label: "Admissions Leads", current: currentConversions.toLocaleString(), previous: prevConversions.toLocaleString(), ...formatDelta(currentConversions, prevConversions) },
      { label: "Lead CVR", current: `${currentCvr}%`, previous: `${prevCvr}%`, ...formatDelta(currentCvr, prevCvr) },
    ],
    tables: [],
  };
}

function generateGa4LandingPages(clientName: string, dateRange: string): CommandResult {
  const pages = [
    "/programs/detox", "/programs/residential-treatment", "/insurance-verification",
    "/admissions", "/programs/outpatient", "/programs/php-iop",
    "/treatment/alcohol", "/treatment/opioid", "/treatment/dual-diagnosis",
    "/about-us", "/blog/signs-of-addiction", "/treatment/meth",
    "/contact", "/blog/relapse-prevention", "/programs/sober-living",
    "/blog/family-support", "/testimonials", "/treatment/cocaine",
    "/blog/what-to-expect", "/blog/mental-health",
  ];

  const rows = pages.map((p) => {
    const sess = randomDelta(1200, 500);
    const conv = randomDelta(18, 10);
    const cvr = ((conv / sess) * 100).toFixed(2);
    const prevSess = randomDelta(1000, 400);
    const prevConv = randomDelta(14, 8);
    return [p, sess, conv, `${cvr}%`, prevSess, prevConv, formatPercent(((conv - prevConv) / Math.max(prevConv, 1)) * 100)];
  });

  return {
    command: "ga4_qoq_organic_landing_pages",
    clientName, dateRange,
    summary: [
      { label: "Top Pages by Leads", current: "20", previous: "20", delta: "0", deltaPercent: "0%", isPositive: true },
    ],
    tables: [
      { title: "Top 20 Landing Pages by Admissions Leads", headers: ["Landing Page", "Sessions", "Leads", "CVR", "Prev Sessions", "Prev Leads", "Lead Change %"], rows },
    ],
  };
}

function generateCallCalls(clientName: string, dateRange: string, command: "callrail_qoq_organic_calls" | "ctm_qoq_organic_calls"): CommandResult {
  const currentCalls = randomDelta(340, 80);
  const prevCalls = randomDelta(290, 70);
  const currentUnique = randomDelta(280, 60);
  const prevUnique = randomDelta(240, 55);
  const currentFirstTime = randomDelta(180, 40);
  const prevFirstTime = randomDelta(155, 35);
  const currentAvgDuration = randomDelta(185, 45);
  const prevAvgDuration = randomDelta(172, 40);
  const qualifiedPct = randomDelta(68, 15);

  return {
    command,
    clientName, dateRange,
    summary: [
      { label: "Total Calls", current: currentCalls.toLocaleString(), previous: prevCalls.toLocaleString(), ...formatDelta(currentCalls, prevCalls) },
      { label: "Unique Callers", current: currentUnique.toLocaleString(), previous: prevUnique.toLocaleString(), ...formatDelta(currentUnique, prevUnique) },
      { label: "First-Time Callers", current: currentFirstTime.toLocaleString(), previous: prevFirstTime.toLocaleString(), ...formatDelta(currentFirstTime, prevFirstTime) },
      { label: "Avg Duration", current: `${Math.floor(currentAvgDuration / 60)}m ${currentAvgDuration % 60}s`, previous: `${Math.floor(prevAvgDuration / 60)}m ${prevAvgDuration % 60}s`, ...formatDelta(currentAvgDuration, prevAvgDuration) },
      { label: "Qualified %", current: `${qualifiedPct}%`, previous: `${qualifiedPct - 3}%`, delta: "+3%", deltaPercent: "+4.6%", isPositive: true },
    ],
    tables: [],
  };
}

function generateCallLandingPages(clientName: string, dateRange: string, command: "callrail_qoq_top_landing_pages" | "ctm_qoq_top_landing_pages"): CommandResult {
  const pages = [
    "/programs/detox", "/programs/residential-treatment", "/insurance-verification",
    "/admissions", "/programs/outpatient", "/contact",
    "/treatment/alcohol", "/treatment/opioid", "/about-us",
    "/treatment/dual-diagnosis", "/programs/php-iop", "/blog/signs-of-addiction",
    "/programs/sober-living", "/testimonials", "/blog/family-support",
    "/treatment/meth", "/blog/relapse-prevention", "/treatment/cocaine",
    "/blog/what-to-expect", "/careers",
  ];

  const rows = pages.map((p) => {
    const cc = randomDelta(25, 12);
    const pc = randomDelta(20, 10);
    const unique = randomDelta(cc - 3, 5);
    return [p, cc, unique, pc, cc - pc, formatPercent(((cc - pc) / Math.max(pc, 1)) * 100)];
  });

  return {
    command,
    clientName, dateRange,
    summary: [
      { label: "Pages with Calls", current: "47", previous: "42", ...formatDelta(47, 42) },
    ],
    tables: [
      { title: "Top 20 Landing Pages by Call Volume", headers: ["Landing Page", "Current Calls", "Unique Callers", "Previous Calls", "Delta", "Change %"], rows },
    ],
  };
}

function generateAhrefsBacklinks(clientName: string, dateRange: string): CommandResult {
  const currentDR = randomDelta(42, 8);
  const prevDR = randomDelta(38, 6);
  const currentRD = randomDelta(1250, 300);
  const prevRD = randomDelta(1100, 250);
  const currentBacklinks = randomDelta(18500, 4000);
  const prevBacklinks = randomDelta(15800, 3500);
  const currentOrgTraffic = randomDelta(32000, 8000);
  const prevOrgTraffic = randomDelta(27000, 6000);

  const topReferrers = [
    "samhsa.gov", "niaaa.nih.gov", "psychologytoday.com",
    "webmd.com", "healthline.com", "mayoclinic.org",
    "recoveryvillage.com", "addictioncenter.com", "drugabuse.gov",
    "rehabcenter.net", "verywellmind.com", "medlineplus.gov",
    "mentalhealth.gov", "apa.org", "nami.org",
  ];

  const rows = topReferrers.map((domain) => {
    const bl = randomDelta(45, 25);
    const dr = randomDelta(65, 20);
    const dofollow = Math.round(bl * 0.7);
    return [domain, dr, bl, dofollow, bl - dofollow, randomDelta(12, 6)];
  });

  return {
    command: "ahrefs_backlink_overview",
    clientName, dateRange,
    summary: [
      { label: "Domain Rating", current: currentDR.toString(), previous: prevDR.toString(), ...formatDelta(currentDR, prevDR) },
      { label: "Referring Domains", current: currentRD.toLocaleString(), previous: prevRD.toLocaleString(), ...formatDelta(currentRD, prevRD) },
      { label: "Total Backlinks", current: currentBacklinks.toLocaleString(), previous: prevBacklinks.toLocaleString(), ...formatDelta(currentBacklinks, prevBacklinks) },
      { label: "Est. Organic Traffic", current: currentOrgTraffic.toLocaleString(), previous: prevOrgTraffic.toLocaleString(), ...formatDelta(currentOrgTraffic, prevOrgTraffic) },
    ],
    tables: [
      { title: "Top Referring Domains", headers: ["Domain", "DR", "Backlinks", "Dofollow", "Nofollow", "New (30d)"], rows },
    ],
  };
}

function generateAhrefsKeywords(clientName: string, dateRange: string): CommandResult {
  const keywords = [
    "drug rehab near me", "alcohol treatment center", "inpatient rehab",
    "detox center near me", "addiction treatment", "outpatient rehab",
    "substance abuse treatment", "opioid rehab", "dual diagnosis treatment",
    "sober living homes", "meth rehab", "cocaine addiction treatment",
    "rehab for couples", "insurance for rehab", "medical detox",
    "php treatment program", "iop near me", "luxury rehab center",
    "faith based rehab", "holistic addiction treatment",
  ];

  const rows = keywords.map((kw) => {
    const pos = randomDelta(18, 12);
    const prevPos = randomDelta(22, 14);
    const vol = randomDelta(3200, 2000);
    const traffic = randomDelta(280, 180);
    return [kw, pos, prevPos, pos - prevPos, vol, traffic];
  });

  return {
    command: "ahrefs_keyword_rankings",
    clientName, dateRange,
    summary: [
      { label: "Tracked Keywords", current: "1,847", previous: "1,692", ...formatDelta(1847, 1692) },
      { label: "Top 3 Keywords", current: "124", previous: "98", ...formatDelta(124, 98) },
      { label: "Top 10 Keywords", current: "387", previous: "342", ...formatDelta(387, 342) },
    ],
    tables: [
      { title: "Top Keyword Movements", headers: ["Keyword", "Current Pos", "Previous Pos", "Change", "Search Volume", "Est. Traffic"], rows },
    ],
  };
}

function generateSemrushOverview(clientName: string, dateRange: string): CommandResult {
  const currentTraffic = randomDelta(35000, 8000);
  const prevTraffic = randomDelta(29000, 7000);
  const currentKeywords = randomDelta(2400, 500);
  const prevKeywords = randomDelta(2100, 450);
  const currentTrafficCost = randomDelta(85000, 20000);
  const prevTrafficCost = randomDelta(72000, 18000);

  return {
    command: "semrush_organic_overview",
    clientName, dateRange,
    summary: [
      { label: "Organic Traffic", current: currentTraffic.toLocaleString(), previous: prevTraffic.toLocaleString(), ...formatDelta(currentTraffic, prevTraffic) },
      { label: "Organic Keywords", current: currentKeywords.toLocaleString(), previous: prevKeywords.toLocaleString(), ...formatDelta(currentKeywords, prevKeywords) },
      { label: "Traffic Cost", current: `$${currentTrafficCost.toLocaleString()}`, previous: `$${prevTrafficCost.toLocaleString()}`, ...formatDelta(currentTrafficCost, prevTrafficCost) },
    ],
    tables: [],
  };
}

function generateSemrushKeywords(clientName: string, dateRange: string): CommandResult {
  const keywords = [
    "rehab center", "addiction recovery", "drug treatment program",
    "alcohol detox", "behavioral health treatment", "substance use disorder treatment",
    "residential treatment center", "outpatient rehab near me",
    "mental health treatment center", "co-occurring disorders",
    "12 step program", "evidence based treatment", "trauma informed care",
    "intensive outpatient program", "partial hospitalization program",
    "medically assisted detox", "telehealth addiction treatment",
    "family intervention services", "addiction relapse prevention",
    "aftercare planning addiction",
  ];

  const rows = keywords.map((kw) => {
    const pos = randomDelta(15, 10);
    const prevPos = randomDelta(20, 12);
    const vol = randomDelta(4500, 3000);
    const cpc = (Math.random() * 40 + 10).toFixed(2);
    return [kw, pos, prevPos, pos - prevPos, vol, `$${cpc}`];
  });

  return {
    command: "semrush_keyword_rankings",
    clientName, dateRange,
    summary: [
      { label: "Position Improvements", current: "312", previous: "274", ...formatDelta(312, 274) },
      { label: "Position Declines", current: "89", previous: "112", delta: "-23", deltaPercent: "-20.5%", isPositive: true },
    ],
    tables: [
      { title: "Keyword Position Tracking", headers: ["Keyword", "Current Pos", "Previous Pos", "Change", "Search Volume", "CPC"], rows },
    ],
  };
}

function generateGscTopQueries(clientName: string, dateRange: string): CommandResult {
  const queries = [
    "drug rehab near me", "alcohol treatment center", "addiction recovery programs",
    "detox center", "inpatient rehab", "outpatient addiction treatment",
    "substance abuse help", "rehab for alcoholism", "drug addiction treatment",
    "best rehab centers", "mental health and addiction", "dual diagnosis treatment",
    "sober living homes", "medication assisted treatment", "opioid addiction treatment",
    "insurance for rehab", "free rehab centers", "luxury rehab",
    "family therapy addiction", "intervention specialist",
  ];
  const rows = queries.map(q => {
    const clicks = randomDelta(420, 200);
    const impressions = randomDelta(8200, 3000);
    const ctr = ((clicks / impressions) * 100).toFixed(1);
    const pos = randomDelta(12, 8);
    const prevClicks = randomDelta(380, 180);
    const prevPos = randomDelta(15, 9);
    return [q, clicks, impressions, `${ctr}%`, pos.toFixed(1), prevClicks, prevPos.toFixed(1), clicks - prevClicks, formatPercent(((clicks - prevClicks) / Math.max(prevClicks, 1)) * 100)];
  });
  return {
    command: "gsc_top_queries",
    clientName, dateRange,
    summary: [
      { label: "Queries Tracked", current: "20", previous: "20", delta: "0", deltaPercent: "0%", isPositive: true },
    ],
    tables: [{ title: "Top 20 GSC Queries", headers: ["Query", "Clicks", "Impressions", "CTR", "Position", "Prev Clicks", "Prev Pos", "Click Δ", "Change %"], rows }],
  };
}

function generateGscQueryToPage(clientName: string, dateRange: string): CommandResult {
  const pages = [
    "/programs/detox", "/programs/residential-treatment", "/insurance-verification",
    "/admissions", "/programs/outpatient", "/programs/php-iop",
    "/treatment/alcohol", "/treatment/opioid", "/treatment/dual-diagnosis",
    "/about-us",
  ];
  const rows = pages.map(p => {
    const q1 = ["drug detox near me", "alcohol detox center", "detox programs"][Math.floor(Math.random() * 3)];
    const q2 = ["inpatient treatment", "residential rehab", "30 day rehab"][Math.floor(Math.random() * 3)];
    const clicks = randomDelta(350, 200);
    const convs = randomDelta(12, 8);
    return [p, clicks, convs, `${((convs / clicks) * 100).toFixed(1)}%`, q1, q2];
  });
  return {
    command: "gsc_query_to_page_map",
    clientName, dateRange,
    summary: [{ label: "Pages Mapped", current: "10", previous: "10", delta: "0", deltaPercent: "0%", isPositive: true }],
    tables: [{ title: "Query-to-Page Conversion Map", headers: ["Landing Page", "Clicks", "Leads", "CVR", "Top Query 1", "Top Query 2"], rows }],
  };
}

function generateHighImpressionsLowCtr(clientName: string, dateRange: string): CommandResult {
  const queries = [
    "rehab centers near me", "drug addiction help", "addiction treatment options",
    "how to find a rehab", "drug rehab cost", "addiction recovery tips",
    "rehab center reviews", "inpatient vs outpatient", "signs of addiction",
    "drug detox symptoms", "withdrawal management", "rehab after insurance",
    "luxury addiction treatment", "faith based rehab near me", "veterans rehab",
  ];
  const rows = queries.map(q => {
    const impressions = randomDelta(14000, 5000);
    const clicks = randomDelta(80, 40);
    const ctr = ((clicks / impressions) * 100).toFixed(2);
    const pos = randomDelta(18, 8);
    return [q, impressions.toLocaleString(), clicks, `${ctr}%`, pos.toFixed(1)];
  });
  return {
    command: "gsc_high_impressions_low_ctr",
    clientName, dateRange,
    summary: [{ label: "Opportunities Found", current: "15", previous: "—", delta: "—", deltaPercent: "—", isPositive: true }],
    tables: [{ title: "High Impressions / Low CTR — Quick-Win Opportunities", headers: ["Query", "Impressions", "Clicks", "CTR", "Avg Position"], rows }],
  };
}

function generateHighTrafficLowCvr(clientName: string, dateRange: string): CommandResult {
  const pages = [
    "/blog/signs-of-addiction", "/blog/what-is-detox", "/blog/types-of-therapy",
    "/blog/relapse-prevention", "/blog/family-support", "/blog/12-step-program",
    "/about-us", "/our-team", "/blog/dual-diagnosis", "/testimonials",
    "/blog/withdrawal-symptoms", "/blog/alcohol-addiction", "/blog/mental-health",
    "/blog/sober-living", "/blog/intervention",
  ];
  const rows = pages.map(p => {
    const sessions = randomDelta(1800, 800);
    const leads = randomDelta(4, 3);
    const cvr = ((leads / sessions) * 100).toFixed(2);
    const avgCvr = 1.8;
    return [p, sessions.toLocaleString(), leads, `${cvr}%`, `${avgCvr}%`, `${(avgCvr - parseFloat(cvr)).toFixed(2)}% below avg`];
  });
  return {
    command: "gsc_high_traffic_low_cvr",
    clientName, dateRange,
    summary: [{ label: "Pages Below Avg CVR", current: "15", previous: "—", delta: "—", deltaPercent: "—", isPositive: false }],
    tables: [{ title: "High Traffic / Low Conversion Pages — CRO Targets", headers: ["Page", "Sessions", "Leads", "CVR", "Site Avg CVR", "Gap"], rows }],
  };
}

function generateIndexationStability(clientName: string, dateRange: string): CommandResult {
  const currentIndexed = randomDelta(1240, 150);
  const prevIndexed = randomDelta(1180, 120);
  const excluded = randomDelta(87, 30);
  const prevExcluded = randomDelta(102, 35);
  const errorRows = [
    ["Crawled — not indexed", randomDelta(42, 15), randomDelta(55, 20), "Low-quality or thin content pages"],
    ["Duplicate — Google chose different canonical", randomDelta(18, 8), randomDelta(22, 10), "Check canonical tags"],
    ["Blocked by robots.txt", randomDelta(12, 5), randomDelta(12, 5), "Review robots.txt rules"],
    ["Not found (404)", randomDelta(8, 4), randomDelta(14, 6), "Redirect or remove"],
    ["Redirect error", randomDelta(4, 3), randomDelta(4, 3), "Fix redirect chains"],
  ];
  return {
    command: "gsc_indexation_stability",
    clientName, dateRange,
    summary: [
      { label: "Indexed Pages", current: currentIndexed.toLocaleString(), previous: prevIndexed.toLocaleString(), ...formatDelta(currentIndexed, prevIndexed) },
      { label: "Excluded Pages", current: excluded.toLocaleString(), previous: prevExcluded.toLocaleString(), delta: `${excluded - prevExcluded}`, deltaPercent: formatPercent(((excluded - prevExcluded) / Math.max(prevExcluded, 1)) * 100), isPositive: excluded < prevExcluded },
    ],
    tables: [{ title: "Coverage Issues by Category", headers: ["Issue Type", "Current Count", "Previous Count", "Action"], rows: errorRows }],
  };
}

function generateCombinedFunnel(clientName: string, dateRange: string): CommandResult {
  const sessions = randomDelta(14200, 3000);
  const prevSessions = randomDelta(12800, 2500);
  const forms = randomDelta(82, 25);
  const prevForms = randomDelta(70, 20);
  const calls = randomDelta(124, 35);
  const prevCalls = randomDelta(108, 30);
  const total = forms + calls;
  const prevTotal = prevForms + prevCalls;
  const cvr = ((total / sessions) * 100).toFixed(2);
  const prevCvr = ((prevTotal / prevSessions) * 100).toFixed(2);
  return {
    command: "ga4_combined_funnel",
    clientName, dateRange,
    summary: [
      { label: "Organic Sessions", current: sessions.toLocaleString(), previous: prevSessions.toLocaleString(), ...formatDelta(sessions, prevSessions) },
      { label: "Form Conversions", current: forms.toLocaleString(), previous: prevForms.toLocaleString(), ...formatDelta(forms, prevForms) },
      { label: "Organic Calls", current: calls.toLocaleString(), previous: prevCalls.toLocaleString(), ...formatDelta(calls, prevCalls) },
      { label: "Total Leads", current: total.toLocaleString(), previous: prevTotal.toLocaleString(), ...formatDelta(total, prevTotal) },
      { label: "Lead CVR", current: `${cvr}%`, previous: `${prevCvr}%`, ...formatDelta(parseFloat(cvr), parseFloat(prevCvr)) },
    ],
    tables: [],
  };
}

function generateQtdTotals(clientName: string, dateRange: string): CommandResult {
  const sessions = randomDelta(38500, 8000);
  const sessionGoal = 45000;
  const leads = randomDelta(248, 60);
  const leadGoal = 300;
  const calls = randomDelta(312, 80);
  const callGoal = 360;
  const cvr = ((leads / sessions) * 100).toFixed(2);
  return {
    command: "ga4_qtd_totals",
    clientName, dateRange,
    summary: [
      { label: "QTD Sessions", current: sessions.toLocaleString(), previous: sessionGoal.toLocaleString(), delta: `${sessions - sessionGoal}`, deltaPercent: formatPercent(((sessions - sessionGoal) / sessionGoal) * 100), isPositive: sessions >= sessionGoal },
      { label: "QTD Leads", current: leads.toLocaleString(), previous: leadGoal.toLocaleString(), delta: `${leads - leadGoal}`, deltaPercent: formatPercent(((leads - leadGoal) / leadGoal) * 100), isPositive: leads >= leadGoal },
      { label: "QTD Calls", current: calls.toLocaleString(), previous: callGoal.toLocaleString(), delta: `${calls - callGoal}`, deltaPercent: formatPercent(((calls - callGoal) / callGoal) * 100), isPositive: calls >= callGoal },
      { label: "QTD CVR", current: `${cvr}%`, previous: "0.78%", delta: `${(parseFloat(cvr) - 0.78).toFixed(2)}%`, deltaPercent: "", isPositive: parseFloat(cvr) >= 0.78 },
    ],
    tables: [],
  };
}

function generateLandingPagesBySessions(clientName: string, dateRange: string): CommandResult {
  const pages = [
    "/programs/detox", "/programs/residential-treatment", "/insurance-verification",
    "/admissions", "/programs/outpatient", "/programs/php-iop",
    "/treatment/alcohol", "/treatment/opioid", "/treatment/dual-diagnosis",
    "/about-us",
  ];
  const rows = pages.map(p => {
    const sessions = randomDelta(2200, 800);
    const forms = randomDelta(14, 8);
    const calls = randomDelta(18, 10);
    const total = forms + calls;
    const cvr = ((total / sessions) * 100).toFixed(1);
    const prevSessions = randomDelta(1900, 700);
    return [p, sessions.toLocaleString(), forms, calls, total, `${cvr}%`, prevSessions.toLocaleString(), formatPercent(((sessions - prevSessions) / Math.max(prevSessions, 1)) * 100)];
  });
  return {
    command: "ga4_landing_pages_by_sessions",
    clientName, dateRange,
    summary: [{ label: "Pages in View", current: "10", previous: "10", delta: "0", deltaPercent: "0%", isPositive: true }],
    tables: [{ title: "Top Landing Pages by Sessions — Full Funnel", headers: ["Page", "Sessions", "Forms", "Calls", "Total Leads", "CVR", "Prev Sessions", "Session Δ%"], rows }],
  };
}

function generateLandingPagesByConversions(clientName: string, dateRange: string): CommandResult {
  const pages = [
    "/insurance-verification", "/admissions", "/programs/detox", "/programs/residential-treatment",
    "/programs/php-iop", "/treatment/opioid", "/programs/outpatient",
    "/treatment/alcohol", "/treatment/dual-diagnosis", "/contact",
  ];
  const rows = pages.map(p => {
    const total = randomDelta(38, 15);
    const forms = Math.round(total * 0.45);
    const calls = total - forms;
    const sessions = randomDelta(1400, 600);
    const cvr = ((total / sessions) * 100).toFixed(1);
    const prevTotal = randomDelta(30, 12);
    return [p, total, forms, calls, `${cvr}%`, prevTotal, total - prevTotal, formatPercent(((total - prevTotal) / Math.max(prevTotal, 1)) * 100)];
  });
  return {
    command: "ga4_landing_pages_by_conversions",
    clientName, dateRange,
    summary: [{ label: "Pages in View", current: "10", previous: "10", delta: "0", deltaPercent: "0%", isPositive: true }],
    tables: [{ title: "Top Landing Pages by Total Leads", headers: ["Page", "Total Leads", "Forms", "Calls", "CVR", "Prev Leads", "Lead Δ", "Change %"], rows }],
  };
}

function generateSessionMovers(clientName: string, dateRange: string): CommandResult {
  const gainers = [
    "/insurance-verification", "/programs/detox", "/treatment/opioid", "/treatment/dual-diagnosis", "/programs/php-iop",
  ];
  const losers = [
    "/blog/signs-of-addiction", "/blog/what-is-detox", "/about-us", "/testimonials", "/our-team",
  ];
  const gainerRows = gainers.map(p => {
    const curr = randomDelta(2200, 600);
    const prev = randomDelta(1600, 500);
    return [p, curr.toLocaleString(), prev.toLocaleString(), `+${(curr - prev).toLocaleString()}`, formatPercent(((curr - prev) / prev) * 100)];
  });
  const loserRows = losers.map(p => {
    const curr = randomDelta(1100, 400);
    const prev = randomDelta(1600, 500);
    return [p, curr.toLocaleString(), prev.toLocaleString(), (curr - prev).toLocaleString(), formatPercent(((curr - prev) / prev) * 100)];
  });
  return {
    command: "ga4_session_movers",
    clientName, dateRange,
    summary: [
      { label: "Pages with Growth", current: "5", previous: "—", delta: "—", deltaPercent: "—", isPositive: true },
      { label: "Pages with Decline", current: "5", previous: "—", delta: "—", deltaPercent: "—", isPositive: false },
    ],
    tables: [
      { title: "Top 5 Session Gainers", headers: ["Page", "Current Sessions", "Previous Sessions", "Delta", "Change %"], rows: gainerRows },
      { title: "Top 5 Session Losers", headers: ["Page", "Current Sessions", "Previous Sessions", "Delta", "Change %"], rows: loserRows },
    ],
  };
}

function generateConversionMovers(clientName: string, dateRange: string): CommandResult {
  const gainers = [
    "/insurance-verification", "/admissions", "/programs/detox", "/programs/php-iop", "/programs/residential-treatment",
  ];
  const losers = [
    "/contact", "/about-us", "/treatment/alcohol", "/blog/family-support", "/programs/outpatient",
  ];
  const gainerRows = gainers.map(p => {
    const curr = randomDelta(32, 12);
    const prev = randomDelta(20, 10);
    return [p, curr, prev, `+${curr - prev}`, formatPercent(((curr - prev) / Math.max(prev, 1)) * 100)];
  });
  const loserRows = losers.map(p => {
    const curr = randomDelta(8, 5);
    const prev = randomDelta(18, 8);
    return [p, curr, prev, curr - prev, formatPercent(((curr - prev) / Math.max(prev, 1)) * 100)];
  });
  return {
    command: "ga4_conversion_movers",
    clientName, dateRange,
    summary: [
      { label: "Lead Gainers", current: "5", previous: "—", delta: "—", deltaPercent: "—", isPositive: true },
      { label: "Lead Losers", current: "5", previous: "—", delta: "—", deltaPercent: "—", isPositive: false },
    ],
    tables: [
      { title: "Top 5 Lead Gainers", headers: ["Page", "Current Leads", "Previous Leads", "Delta", "Change %"], rows: gainerRows },
      { title: "Top 5 Lead Losers", headers: ["Page", "Current Leads", "Previous Leads", "Delta", "Change %"], rows: loserRows },
    ],
  };
}

function generateYoyComparison(clientName: string, dateRange: string): CommandResult {
  const sessions = randomDelta(42000, 8000);
  const prevSessions = randomDelta(34000, 7000);
  const leads = randomDelta(280, 70);
  const prevLeads = randomDelta(210, 55);
  const calls = randomDelta(340, 80);
  const prevCalls = randomDelta(265, 65);
  return {
    command: "ga4_yoy_comparison",
    clientName, dateRange,
    summary: [
      { label: "Organic Sessions YoY", current: sessions.toLocaleString(), previous: prevSessions.toLocaleString(), ...formatDelta(sessions, prevSessions) },
      { label: "Leads YoY", current: leads.toLocaleString(), previous: prevLeads.toLocaleString(), ...formatDelta(leads, prevLeads) },
      { label: "Calls YoY", current: calls.toLocaleString(), previous: prevCalls.toLocaleString(), ...formatDelta(calls, prevCalls) },
      { label: "CVR YoY", current: `${((leads / sessions) * 100).toFixed(2)}%`, previous: `${((prevLeads / prevSessions) * 100).toFixed(2)}%`, ...formatDelta((leads / sessions) * 100, (prevLeads / prevSessions) * 100) },
    ],
    tables: [],
  };
}

function generateCallrailSummary(clientName: string, dateRange: string): CommandResult {
  const total = randomDelta(380, 80);
  const answered = randomDelta(310, 60);
  const qualified = randomDelta(195, 45);
  const answeredPct = ((answered / total) * 100).toFixed(1);
  const qualifiedPct = ((qualified / answered) * 100).toFixed(1);
  const sources = [
    ["google / organic", randomDelta(180, 50), randomDelta(155, 45)],
    ["direct", randomDelta(80, 25), randomDelta(70, 20)],
    ["google / cpc", randomDelta(55, 20), randomDelta(48, 18)],
    ["bing / organic", randomDelta(25, 10), randomDelta(22, 9)],
    ["referral", randomDelta(18, 8), randomDelta(15, 7)],
  ];
  return {
    command: "callrail_summary",
    clientName, dateRange,
    summary: [
      { label: "Total Calls", current: total.toLocaleString(), previous: randomDelta(340, 70).toLocaleString(), ...formatDelta(total, randomDelta(340, 70)) },
      { label: "Answered Rate", current: `${answeredPct}%`, previous: "80.2%", delta: `${(parseFloat(answeredPct) - 80.2).toFixed(1)}%`, deltaPercent: "", isPositive: parseFloat(answeredPct) >= 80.2 },
      { label: "Qualified Rate", current: `${qualifiedPct}%`, previous: "61.8%", delta: `${(parseFloat(qualifiedPct) - 61.8).toFixed(1)}%`, deltaPercent: "", isPositive: parseFloat(qualifiedPct) >= 61.8 },
    ],
    tables: [{ title: "Calls by Source (Top 5)", headers: ["Source", "Current Calls", "Previous Calls"], rows: sources }],
  };
}

function generateCompetitorVisibility(clientName: string, dateRange: string, source: "ahrefs" | "semrush"): CommandResult {
  const domains = [
    "recoverycenters.com", "addictioncenter.com", "americanaddictioncenters.org",
    "therecoveryvillage.com", "rehabspot.com", "drugrehab.com",
    "verywellmind.com", "healthline.com", "sunrisehouse.com", "mountainside.com",
  ];
  const rows = domains.map(d => {
    const visibility = randomDelta(42, 20);
    const prevVisibility = randomDelta(38, 18);
    const traffic = randomDelta(28000, 12000);
    return [d, `${visibility}%`, `${prevVisibility}%`, formatPercent(visibility - prevVisibility), traffic.toLocaleString()];
  });
  const cmd = source === "ahrefs" ? "ahrefs_competitor_visibility" as const : "semrush_competitor_visibility" as const;
  return {
    command: cmd,
    clientName, dateRange,
    summary: [{ label: "Competitors Tracked", current: "10", previous: "10", delta: "0", deltaPercent: "0%", isPositive: true }],
    tables: [{ title: `Competitor Visibility — ${source === "ahrefs" ? "Ahrefs" : "SEMrush"}`, headers: ["Domain", "Current Visibility", "Previous Visibility", "Visibility Δ", "Est. Traffic"], rows }],
  };
}

function generateKeywordDistribution(clientName: string, dateRange: string): CommandResult {
  const top3 = randomDelta(145, 30);
  const prevTop3 = randomDelta(118, 25);
  const top10 = randomDelta(412, 80);
  const prevTop10 = randomDelta(368, 70);
  const top20 = randomDelta(887, 150);
  const prevTop20 = randomDelta(798, 130);
  return {
    command: "semrush_keyword_distribution",
    clientName, dateRange,
    summary: [
      { label: "Top 3 Keywords", current: top3.toLocaleString(), previous: prevTop3.toLocaleString(), ...formatDelta(top3, prevTop3) },
      { label: "Top 10 Keywords", current: top10.toLocaleString(), previous: prevTop10.toLocaleString(), ...formatDelta(top10, prevTop10) },
      { label: "Top 20 Keywords", current: top20.toLocaleString(), previous: prevTop20.toLocaleString(), ...formatDelta(top20, prevTop20) },
    ],
    tables: [
      { title: "Keyword Distribution by Position Tier", headers: ["Tier", "Current Count", "Previous Count", "Delta", "Change %"], rows: [
        ["Top 3", top3, prevTop3, top3 - prevTop3, formatPercent(((top3 - prevTop3) / prevTop3) * 100)],
        ["Top 4–10", top10 - top3, prevTop10 - prevTop3, (top10 - top3) - (prevTop10 - prevTop3), ""],
        ["Top 11–20", top20 - top10, prevTop20 - prevTop10, (top20 - top10) - (prevTop20 - prevTop10), ""],
      ]},
    ],
  };
}

function generateContentOutputSummary(clientName: string, dateRange: string): CommandResult {
  const published = randomDelta(6, 3);
  const refreshed = randomDelta(4, 2);
  const pages = [
    ["Is Detox Covered by Insurance?", "published", "insurance detox coverage", "1,840 impr / 42 clicks"],
    ["What Is Dual Diagnosis?", "published", "dual diagnosis treatment", "3,200 impr / 88 clicks"],
    ["PHP vs IOP: Which Is Right?", "published", "partial hospitalization program", "960 impr / 31 clicks"],
    ["Opioid Detox Timeline", "refreshed", "opioid withdrawal timeline", "5,100 impr / 124 clicks"],
    ["Signs You Need Rehab", "refreshed", "signs of drug addiction", "2,780 impr / 67 clicks"],
  ];
  return {
    command: "content_output_summary",
    clientName, dateRange,
    summary: [
      { label: "Pages Published", current: published.toLocaleString(), previous: randomDelta(4, 2).toLocaleString(), ...formatDelta(published, randomDelta(4, 2)) },
      { label: "Pages Refreshed", current: refreshed.toLocaleString(), previous: randomDelta(2, 1).toLocaleString(), ...formatDelta(refreshed, randomDelta(2, 1)) },
    ],
    tables: [{ title: "New & Refreshed Pages — Early GSC Performance", headers: ["Page Title", "Status", "Target Keyword", "Early GSC Signal"], rows: pages }],
  };
}

function generateTechnicalHealthSummary(clientName: string, dateRange: string): CommandResult {
  const issuesFound = randomDelta(24, 10);
  const issuesFixed = randomDelta(18, 8);
  const outstanding = issuesFound - issuesFixed;
  const issues = [
    ["Missing H1 tags", randomDelta(8, 4), "High", "Fixed"],
    ["Broken internal links", randomDelta(12, 6), "High", "Fixed"],
    ["Pages without meta description", randomDelta(15, 8), "Medium", "In progress"],
    ["Slow page load (>3s)", randomDelta(6, 3), "High", "Outstanding"],
    ["Redirect chains (3+ hops)", randomDelta(4, 2), "Medium", "Outstanding"],
    ["Duplicate title tags", randomDelta(5, 3), "Medium", "Fixed"],
  ];
  return {
    command: "technical_health_summary",
    clientName, dateRange,
    summary: [
      { label: "Issues Found", current: issuesFound.toLocaleString(), previous: randomDelta(30, 12).toLocaleString(), ...formatDelta(issuesFound, randomDelta(30, 12)) },
      { label: "Issues Fixed", current: issuesFixed.toLocaleString(), previous: "—", delta: "—", deltaPercent: "—", isPositive: true },
      { label: "Outstanding", current: outstanding.toLocaleString(), previous: "—", delta: "—", deltaPercent: "—", isPositive: outstanding === 0 },
    ],
    tables: [{ title: "Technical Issues by Category", headers: ["Issue", "Count", "Priority", "Status"], rows: issues }],
  };
}

function generateCoreWebVitals(clientName: string, dateRange: string): CommandResult {
  const goodLcp = randomDelta(68, 12);
  const goodCls = randomDelta(82, 8);
  const goodInp = randomDelta(74, 10);
  return {
    command: "core_web_vitals",
    clientName, dateRange,
    summary: [
      { label: "Good LCP (≤2.5s)", current: `${goodLcp}%`, previous: `${goodLcp - 5}%`, ...formatDelta(goodLcp, goodLcp - 5) },
      { label: "Good CLS (≤0.1)", current: `${goodCls}%`, previous: `${goodCls - 3}%`, ...formatDelta(goodCls, goodCls - 3) },
      { label: "Good INP (≤200ms)", current: `${goodInp}%`, previous: `${goodInp - 4}%`, ...formatDelta(goodInp, goodInp - 4) },
    ],
    tables: [],
  };
}

function generateGbpLocalSummary(clientName: string, dateRange: string): CommandResult {
  const reviews = randomDelta(12, 5);
  const prevReviews = randomDelta(8, 4);
  const rating = (4.2 + Math.random() * 0.5).toFixed(1);
  const interactions = randomDelta(840, 200);
  return {
    command: "gbp_local_summary",
    clientName, dateRange,
    summary: [
      { label: "New Reviews", current: reviews.toLocaleString(), previous: prevReviews.toLocaleString(), ...formatDelta(reviews, prevReviews) },
      { label: "Avg Rating", current: rating, previous: "4.3", delta: `${(parseFloat(rating) - 4.3).toFixed(1)}`, deltaPercent: "", isPositive: parseFloat(rating) >= 4.3 },
      { label: "GBP Interactions", current: interactions.toLocaleString(), previous: randomDelta(720, 180).toLocaleString(), ...formatDelta(interactions, randomDelta(720, 180)) },
    ],
    tables: [{ title: "GBP Activity", headers: ["Metric", "This Period", "Previous Period", "Change"], rows: [
      ["Phone clicks", randomDelta(220, 60), randomDelta(195, 50), "+12%"],
      ["Direction requests", randomDelta(145, 40), randomDelta(128, 35), "+13%"],
      ["Website clicks", randomDelta(312, 80), randomDelta(278, 70), "+12%"],
      ["Posts published", randomDelta(6, 3), randomDelta(5, 2), "+1"],
    ]}],
  };
}

function generateNewPagesTracker(clientName: string, dateRange: string): CommandResult {
  const pages = [
    ["/programs/holistic-treatment", "holistic addiction treatment", "Submitted", "0 clicks / 480 impr"],
    ["/blog/fentanyl-addiction-treatment", "fentanyl addiction treatment", "Indexed", "12 clicks / 2,840 impr"],
    ["/insurance/blue-cross", "blue cross rehab coverage", "Indexed", "8 clicks / 1,620 impr"],
    ["/programs/trauma-therapy", "trauma therapy for addiction", "Indexed", "4 clicks / 920 impr"],
    ["/blog/what-is-vivitrol", "vivitrol shot for addiction", "Indexed", "6 clicks / 1,100 impr"],
    ["/treatment/benzodiazepine", "benzo addiction treatment", "Indexed", "9 clicks / 1,840 impr"],
  ];
  return {
    command: "new_pages_tracker",
    clientName, dateRange,
    summary: [
      { label: "New Pages", current: "6", previous: "—", delta: "—", deltaPercent: "—", isPositive: true },
    ],
    tables: [{ title: "New & Updated Pages — GSC Early Signals", headers: ["URL", "Target Keyword", "Index Status", "Early GSC Performance"], rows: pages }],
  };
}

function generateTrackingAnomalyCheck(clientName: string, dateRange: string): CommandResult {
  const checks = [
    ["GA4 — admissions_form event", "Firing on all thank-you pages", "✓ OK", "Low"],
    ["GA4 — phone_click event", "Missing on /programs/detox mobile", "⚠ Issue", "High"],
    ["CallRail — organic source attribution", "Google / organic intact", "✓ OK", "Low"],
    ["GSC — click volume vs GA4 sessions", "Within 8% variance", "✓ OK", "Low"],
    ["Screaming Frog — redirect check", "2 new 301s detected", "✓ OK", "Low"],
    ["GA4 — insurance_verification event", "Firing correctly", "✓ OK", "Low"],
  ];
  return {
    command: "tracking_anomaly_check",
    clientName, dateRange,
    summary: [
      { label: "Checks Run", current: "6", previous: "—", delta: "—", deltaPercent: "—", isPositive: true },
      { label: "Issues Found", current: "1", previous: "—", delta: "—", deltaPercent: "—", isPositive: false },
    ],
    tables: [{ title: "Tracking Health Check", headers: ["Check", "Finding", "Status", "Priority"], rows: checks }],
  };
}

function generateMonthlyTrendline(clientName: string, dateRange: string): CommandResult {
  const months = ["Month –2", "Month –1", "Current Month"];
  const rows = months.map((m, i) => {
    const sessions = randomDelta(28000 + i * 2000, 4000);
    const calls = randomDelta(280 + i * 15, 50);
    const forms = randomDelta(140 + i * 10, 30);
    const total = calls + forms;
    const cvr = ((total / sessions) * 100).toFixed(2);
    return [m, sessions.toLocaleString(), forms, calls, total, `${cvr}%`];
  });
  return {
    command: "monthly_trendline",
    clientName, dateRange,
    summary: [{ label: "Months in View", current: "3", previous: "—", delta: "—", deltaPercent: "—", isPositive: true }],
    tables: [{ title: "Monthly Trendline — Sessions, Calls, Leads, CVR", headers: ["Month", "Sessions", "Forms", "Calls", "Total Leads", "CVR"], rows }],
  };
}

function generateQuarterlyForecast(clientName: string, dateRange: string): CommandResult {
  const basesessions = randomDelta(52000, 8000);
  const upsideSessions = Math.round(basesessions * 1.12);
  const downsideSessions = Math.round(basesessions * 0.92);
  const baseLeads = randomDelta(340, 60);
  const upsideLeads = Math.round(baseLeads * 1.15);
  const downsideLeads = Math.round(baseLeads * 0.88);
  return {
    command: "quarterly_forecast",
    clientName, dateRange,
    summary: [
      { label: "Base Sessions Forecast", current: basesessions.toLocaleString(), previous: randomDelta(46000, 7000).toLocaleString(), ...formatDelta(basesessions, randomDelta(46000, 7000)) },
      { label: "Base Leads Forecast", current: baseLeads.toLocaleString(), previous: randomDelta(295, 55).toLocaleString(), ...formatDelta(baseLeads, randomDelta(295, 55)) },
    ],
    tables: [{ title: "Q+1 Forecast — Base / Upside / Downside", headers: ["Metric", "Downside", "Base Case", "Upside"], rows: [
      ["Organic Sessions", downsideSessions.toLocaleString(), basesessions.toLocaleString(), upsideSessions.toLocaleString()],
      ["Total Leads", downsideLeads.toLocaleString(), baseLeads.toLocaleString(), upsideLeads.toLocaleString()],
      ["Lead CVR", "0.61%", "0.70%", "0.82%"],
    ]}],
  };
}

function generateWorkLogPlaceholder(clientName: string, dateRange: string): CommandResult {
  return {
    command: "airtable_work_log",
    clientName, dateRange,
    summary: [
      { label: "Status", current: "Not configured", previous: "—", delta: "—", deltaPercent: "—", isPositive: false },
    ],
    tables: [{ title: "Setup Required", headers: ["Step", "Action"], rows: [
      ["1", "Open client settings and add your Airtable Base ID (starts with 'app')"],
      ["2", "Add the Table or View name that contains your work log records"],
      ["3", "Go to Setup → Work Tracking and add your Airtable Personal Access Token"],
      ["4", "Make sure the PAT has data.records:read scope on the relevant base"],
    ]}],
  };
}
