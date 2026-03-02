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
    case "ga4_qoq_organic_funnel": return generateGa4Funnel(clientName, dateRange);
    case "ga4_qoq_organic_landing_pages": return generateGa4LandingPages(clientName, dateRange);
    case "callrail_qoq_organic_calls": return generateCallCalls(clientName, dateRange, "callrail_qoq_organic_calls");
    case "callrail_qoq_top_landing_pages": return generateCallLandingPages(clientName, dateRange, "callrail_qoq_top_landing_pages");
    case "ctm_qoq_organic_calls": return generateCallCalls(clientName, dateRange, "ctm_qoq_organic_calls");
    case "ctm_qoq_top_landing_pages": return generateCallLandingPages(clientName, dateRange, "ctm_qoq_top_landing_pages");
    case "ahrefs_backlink_overview": return generateAhrefsBacklinks(clientName, dateRange);
    case "ahrefs_keyword_rankings": return generateAhrefsKeywords(clientName, dateRange);
    case "semrush_organic_overview": return generateSemrushOverview(clientName, dateRange);
    case "semrush_keyword_rankings": return generateSemrushKeywords(clientName, dateRange);
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
