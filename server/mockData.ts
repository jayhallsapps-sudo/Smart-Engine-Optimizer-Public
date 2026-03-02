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
    case "gsc_qoq_queries":
      return generateGscQueries(clientName, dateRange);
    case "gsc_qoq_pages":
      return generateGscPages(clientName, dateRange);
    case "ga4_qoq_organic_funnel":
      return generateGa4Funnel(clientName, dateRange);
    case "ga4_qoq_organic_landing_pages":
      return generateGa4LandingPages(clientName, dateRange);
    case "callrail_qoq_organic_calls":
      return generateCallrailCalls(clientName, dateRange);
    case "callrail_qoq_top_landing_pages":
      return generateCallrailLandingPages(clientName, dateRange);
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
    "best seo tools 2025", "local seo services", "seo audit checklist",
    "google search console tips", "organic traffic growth", "keyword research tool",
    "content optimization", "technical seo guide", "backlink strategy",
    "rank tracking software", "seo competitor analysis", "on-page seo",
    "schema markup guide", "core web vitals fix", "seo reporting dashboard",
    "link building services", "mobile seo optimization", "seo roi calculator",
    "site speed optimization", "serp feature targeting",
  ];

  const loserQueries = [
    "seo company near me", "cheap seo services", "wordpress seo plugin",
    "meta tag generator", "sitemap generator", "robots txt example",
    "canonical url setup", "301 redirect checker", "broken link finder",
    "duplicate content checker", "hreflang tag generator", "xml sitemap tool",
    "page speed test", "seo score checker", "domain authority checker",
    "backlink checker free", "keyword density tool", "search volume tool",
    "rank checker online", "seo glossary terms",
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
    clientName,
    dateRange,
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
    "/services/seo-audit", "/blog/keyword-research-guide", "/services/local-seo",
    "/blog/technical-seo-checklist", "/pricing", "/services/link-building",
    "/blog/content-strategy", "/case-studies", "/blog/core-web-vitals",
    "/services/content-marketing", "/about", "/blog/competitor-analysis",
    "/services/ppc-management", "/contact", "/blog/schema-markup",
    "/tools/rank-tracker", "/blog/mobile-seo", "/services/web-design",
    "/blog/ecommerce-seo", "/resources/seo-glossary",
  ];

  const winnersRows = pages.map((p) => {
    const cc = randomDelta(800, 400);
    const pc = randomDelta(550, 250);
    return [p, cc, pc, cc - pc, formatPercent(((cc - pc) / Math.max(pc, 1)) * 100)];
  });

  return {
    command: "gsc_qoq_pages",
    clientName,
    dateRange,
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
    clientName,
    dateRange,
    summary: [
      { label: "Organic Sessions", current: currentSessions.toLocaleString(), previous: prevSessions.toLocaleString(), ...formatDelta(currentSessions, prevSessions) },
      { label: "Total Users", current: currentUsers.toLocaleString(), previous: prevUsers.toLocaleString(), ...formatDelta(currentUsers, prevUsers) },
      { label: "Conversions", current: currentConversions.toLocaleString(), previous: prevConversions.toLocaleString(), ...formatDelta(currentConversions, prevConversions) },
      { label: "CVR", current: `${currentCvr}%`, previous: `${prevCvr}%`, ...formatDelta(currentCvr, prevCvr) },
    ],
    tables: [],
  };
}

function generateGa4LandingPages(clientName: string, dateRange: string): CommandResult {
  const pages = [
    "/services/seo-audit", "/blog/keyword-research", "/services/local-seo",
    "/pricing", "/services/link-building", "/blog/content-strategy",
    "/case-studies", "/blog/core-web-vitals", "/services/content-marketing",
    "/about", "/blog/competitor-analysis", "/services/ppc-management",
    "/contact", "/blog/schema-markup", "/tools/rank-tracker",
    "/blog/mobile-seo", "/services/web-design", "/blog/ecommerce-seo",
    "/resources", "/blog/seo-trends-2025",
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
    clientName,
    dateRange,
    summary: [
      { label: "Top Pages by Conversions", current: "20", previous: "20", delta: "0", deltaPercent: "0%", isPositive: true },
    ],
    tables: [
      { title: "Top 20 Landing Pages by Conversions", headers: ["Landing Page", "Sessions", "Conversions", "CVR", "Prev Sessions", "Prev Conversions", "Conv Change %"], rows },
    ],
  };
}

function generateCallrailCalls(clientName: string, dateRange: string): CommandResult {
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
    command: "callrail_qoq_organic_calls",
    clientName,
    dateRange,
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

function generateCallrailLandingPages(clientName: string, dateRange: string): CommandResult {
  const pages = [
    "/services/seo-audit", "/services/local-seo", "/pricing",
    "/services/link-building", "/contact", "/services/content-marketing",
    "/services/ppc-management", "/services/web-design", "/about",
    "/case-studies", "/blog/keyword-research", "/blog/seo-guide",
    "/services/social-media", "/resources", "/blog/analytics",
    "/tools/rank-tracker", "/blog/technical-seo", "/services/email-marketing",
    "/blog/local-seo-tips", "/careers",
  ];

  const rows = pages.map((p) => {
    const cc = randomDelta(25, 12);
    const pc = randomDelta(20, 10);
    const unique = randomDelta(cc - 3, 5);
    return [p, cc, unique, pc, cc - pc, formatPercent(((cc - pc) / Math.max(pc, 1)) * 100)];
  });

  return {
    command: "callrail_qoq_top_landing_pages",
    clientName,
    dateRange,
    summary: [
      { label: "Pages with Calls", current: "47", previous: "42", ...formatDelta(47, 42) },
    ],
    tables: [
      { title: "Top 20 Landing Pages by Call Volume", headers: ["Landing Page", "Current Calls", "Unique Callers", "Previous Calls", "Delta", "Change %"], rows },
    ],
  };
}
