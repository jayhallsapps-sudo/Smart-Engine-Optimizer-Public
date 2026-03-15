import { storage } from "./storage";
import { fetchAirtableWorkLog } from "./airtable";
import { fetchNsmGoals } from "./sheetsClient";
import { fetchAsanaWorkLog, asanaSectionToCategory, groupAsanaTasks } from "./asanaClient";
import type { WorkLogItem } from "./airtable";
import type { DocxSection } from "../client/src/components/report-preview/docx-preview";

export interface BiweeklyReportJson {
  report_title: string;
  client_name: string;
  date: string;
  reportingWindow: string;
  preparedBy: string;
  generated_at: string;
  sections: DocxSection[];
  internalAmNotes?: InternalAmNotes;
}

export interface InternalAmNotes {
  storyToTell: string;
  talkingPoints: string[];
  missingInputs: string[];
  risksCarryForwards: string[];
  clientQuestions: string[];
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function parseDateStr(s: string): Date {
  const [y, m, day] = s.split("-").map(Number);
  return new Date(y, m - 1, day);
}

function makeWindowLabel(start: string, end: string): string {
  return `${fmtDate(parseDateStr(start))} – ${fmtDate(parseDateStr(end))}`;
}

function isOptimizationItem(item: WorkLogItem): boolean {
  return (
    item.task.toLowerCase().includes("optimization") ||
    item.creditType === "Optimization" ||
    item.creditType === "CRO Update"
  );
}

function isNewContentItem(item: WorkLogItem): boolean {
  return !isOptimizationItem(item);
}

function parseSfCanonicalIssues(headers: string[], data: Record<string, any>[]): number {
  const addrCol = headers.find(h => /^address$/i.test(h) || /^url$/i.test(h)) ?? "Address";
  const canonCol = headers.find(h => /canonical/i.test(h));
  if (!canonCol) return 0;
  return data.filter(r => {
    const addr = String(r[addrCol] ?? "").trim();
    const canon = String(r[canonCol] ?? "").trim();
    return addr && canon && addr !== canon;
  }).length;
}

function parseSfImageIssues(headers: string[], data: Record<string, any>[]): number {
  const sizeCol = headers.find(h => /^size$/i.test(h) || /image.?size/i.test(h));
  if (!sizeCol) return 0;
  const LARGE_BYTES = 150 * 1024;
  return data.filter(r => {
    const v = parseInt(String(r[sizeCol] ?? "0").replace(/[^0-9]/g, ""), 10);
    return v > LARGE_BYTES;
  }).length;
}

function parseSf404s(headers: string[], data: Record<string, any>[]): number {
  const statusCol = headers.find(h => /status.?code/i.test(h) || /^status$/i.test(h));
  if (!statusCol) return 0;
  return data.filter(r => String(r[statusCol] ?? "").trim() === "404").length;
}

function parseSfMissingMeta(headers: string[], data: Record<string, any>[]): number {
  const metaCol = headers.find(h => /meta.?description/i.test(h));
  if (!metaCol) return 0;
  return data.filter(r => !String(r[metaCol] ?? "").trim()).length;
}

interface SfIssueCounts {
  canonical: number;
  images: number;
  errors404: number;
  missingMeta: number;
}

function getSfTopPriorities(counts: SfIssueCounts): string[] {
  const issues: Array<{ count: number; label: string }> = [];
  if (counts.canonical > 0) issues.push({ count: counts.canonical, label: `Fix canonical tag conflicts — ${counts.canonical} page${counts.canonical !== 1 ? "s" : ""} with mismatched or non-self-referencing canonicals` });
  if (counts.errors404 > 0) issues.push({ count: counts.errors404, label: `Resolve ${counts.errors404} broken internal link${counts.errors404 !== 1 ? "s" : ""} — implement 301 redirects or update destination URLs` });
  if (counts.images > 0) issues.push({ count: counts.images, label: `Compress ${counts.images} oversized image${counts.images !== 1 ? "s" : ""} (>150 KB) — prioritize images on service and location pages` });
  if (counts.missingMeta > 0) issues.push({ count: counts.missingMeta, label: `Write missing meta descriptions for service and location pages — prioritize by organic traffic volume` });
  issues.sort((a, b) => b.count - a.count);
  const top2 = issues.slice(0, 2).map(i => i.label);
  const fallbacks = [
    "Review Core Web Vitals for top service and location landing pages",
    "Identify and consolidate duplicate content across location pages",
    "Audit redirect chains and broken internal links in crawl data",
  ];
  while (top2.length < 2) {
    top2.push(fallbacks[top2.length] ?? "Review crawl report for additional technical issues");
  }
  return top2;
}

function aggregateSfCounts(reports: any[]): SfIssueCounts {
  const totals: SfIssueCounts = { canonical: 0, images: 0, errors404: 0, missingMeta: 0 };
  for (const sf of reports) {
    const headers: string[] = sf.headers ?? [];
    const data: Record<string, any>[] = (sf.data ?? []) as Record<string, any>[];
    totals.canonical += parseSfCanonicalIssues(headers, data);
    totals.images += parseSfImageIssues(headers, data);
    totals.errors404 += parseSf404s(headers, data);
    totals.missingMeta += parseSfMissingMeta(headers, data);
  }
  return totals;
}

function allAirtableItems(result: PromiseSettledResult<any>): WorkLogItem[] {
  if (result.status !== "fulfilled" || !result.value?.success) return [];
  const data = result.value.data;
  const items: WorkLogItem[] = [];
  for (const group of Object.values(data.byCreditType)) {
    items.push(...(group as WorkLogItem[]));
  }
  return items;
}

type BulletItem = { text: string; url?: string; source?: string };
type WorkLogRow = NonNullable<DocxSection["workLog"]>[number];

function makeRow(
  area: string,
  didItems: BulletItem[],
  nextItemsRich: BulletItem[],
  didPlaceholder: string,
  nextPlaceholder: string
): WorkLogRow {
  const actualDid = didItems.length > 0 ? didItems : didPlaceholder ? [{ text: didPlaceholder }] : [];
  const actualNext = nextItemsRich.length > 0 ? nextItemsRich : nextPlaceholder ? [{ text: nextPlaceholder }] : [];
  return {
    area,
    whatWeDid: actualDid.map(i => i.text).join("\n"),
    whatsNext: actualNext.map(i => i.text).join("\n"),
    items: actualDid,
    nextItems: actualNext.map(i => i.text),
    nextItemsRich: actualNext,
  };
}

function buildInternalAmNotes(params: {
  clientName: string;
  nsmGoals: any;
  newContentDid: BulletItem[];
  newContentNext: BulletItem[];
  optDid: BulletItem[];
  sfPriorities: string[];
  hasSf: boolean;
  noAirtable: boolean;
  windowLabel: string;
}): InternalAmNotes {
  const { clientName, nsmGoals, newContentDid, newContentNext, optDid, sfPriorities, hasSf, noAirtable, windowLabel } = params;

  const missingInputs: string[] = [];
  if (noAirtable) missingInputs.push("Airtable not connected — content rows will be empty");
  if (!hasSf) missingInputs.push("No Screaming Frog crawl uploaded — technical priorities are estimated");
  if (!nsmGoals || (!nsmGoals.sessionsGoal || nsmGoals.sessionsGoal === "—")) missingInputs.push("NSM sheet data not found — verify Google Sheets connection");

  const talkingPoints: string[] = [];
  if (nsmGoals && nsmGoals.sessionsActual && nsmGoals.sessionsGoal && nsmGoals.sessionsActual !== "—" && nsmGoals.sessionsGoal !== "—") {
    talkingPoints.push(`Organic sessions pacing: ${nsmGoals.sessionsActual} vs ${nsmGoals.sessionsGoal} goal (${nsmGoals.sessionsPercent ?? "?"}%)`);
  }
  if (newContentDid.length > 0) talkingPoints.push(`${newContentDid.length} content item${newContentDid.length !== 1 ? "s" : ""} published/completed this period`);
  if (optDid.length > 0) talkingPoints.push(`${optDid.length} optimization item${optDid.length !== 1 ? "s" : ""} completed`);
  if (sfPriorities.length > 0 && hasSf) talkingPoints.push(`Top technical issue: ${sfPriorities[0]}`);
  if (newContentNext.length > 0) talkingPoints.push(`${newContentNext.length} content item${newContentNext.length !== 1 ? "s" : ""} planned for the next 2 weeks`);

  const risksCarryForwards: string[] = [];
  if (!hasSf) risksCarryForwards.push("Technical SEO 'What's Next' uses estimated priorities — upload a fresh Screaming Frog crawl to confirm");
  if (noAirtable) risksCarryForwards.push("Content rows are empty until Airtable is connected");

  const clientQuestions = [
    "Any changes to lead quality or intake volume this period?",
    "Any new campaigns, service lines, or locations to factor in?",
    "Any client feedback on content topics or the website experience?",
  ];

  const storyToTell = `This biweekly covers ${windowLabel} for ${clientName}. ` +
    (talkingPoints.length > 0 ? `Key points to lead with: ${talkingPoints[0]}.` : "Review all sections with the client before the call.");

  return { storyToTell, talkingPoints, missingInputs, risksCarryForwards, clientQuestions };
}

export async function generateBiweekly(input: {
  clientId: number;
  startDate: string;
  endDate: string;
  preparedBy: string;
}): Promise<BiweeklyReportJson> {
  const { clientId, startDate, endDate, preparedBy } = input;
  const client = await storage.getClient(clientId);
  if (!client) throw new Error("Client not found: " + clientId);

  const windowLabel = makeWindowLabel(startDate, endDate);
  const now = new Date();

  const asanaProjectId = (client as any).asanaProjectId as string | null | undefined;

  const nextStart = endDate;
  const nextEndDate = new Date(parseDateStr(endDate).getTime() + 14 * 24 * 60 * 60 * 1000);
  const nextEnd = `${nextEndDate.getFullYear()}-${String(nextEndDate.getMonth() + 1).padStart(2, "0")}-${String(nextEndDate.getDate()).padStart(2, "0")}`;

  const [publishedResult, productionResult, sfReportsResult, nsmResult, asanaResult] =
    await Promise.allSettled([
      fetchAirtableWorkLog(clientId, startDate, endDate, "published"),
      fetchAirtableWorkLog(clientId, nextStart, nextEnd, "production"),
      storage.getSfReports(clientId),
      fetchNsmGoals(client.name),
      asanaProjectId ? fetchAsanaWorkLog(asanaProjectId, startDate, endDate) : Promise.resolve(null),
    ]);

  const sections: DocxSection[] = [];

  sections.push({
    id: "bw_purpose",
    type: "bullets",
    title: "Purpose",
    bullets: [
      "To review recent SEO progress, share quick wins, and align on upcoming priorities that support your business goals.",
    ],
  });

  const nsmGoals = nsmResult.status === "fulfilled" ? nsmResult.value : null;
  const nsmHasData = nsmGoals && (
    (nsmGoals.sessionsGoal && nsmGoals.sessionsGoal !== "—") ||
    (nsmGoals.mvpGoal && nsmGoals.mvpGoal !== "—")
  );

  const pulseMetrics: Array<{
    label: string;
    current: string;
    previous?: string;
    delta?: string;
    isPositive?: boolean;
    source?: string;
  }> = [];

  if (nsmGoals && nsmHasData) {
    const mvpType = nsmGoals.mvpType && nsmGoals.mvpType !== "—" ? nsmGoals.mvpType : "MVP";
    pulseMetrics.push(
      { label: "NSM Quarter",                     current: nsmGoals.quarter,         source: "NSM Sheet" },
      { label: "NSM Sessions Goal",               current: nsmGoals.sessionsGoal,    source: "NSM Sheet" },
      { label: "NSM Sessions Actual",             current: nsmGoals.sessionsActual,  source: "NSM Sheet" },
      { label: "NSM Sessions %",                  current: nsmGoals.sessionsPercent, source: "NSM Sheet" },
      { label: "NSM Sessions On Track",           current: nsmGoals.sessionsOnTrack, source: "NSM Sheet" },
      { label: `NSM MVP ${mvpType} Goal`,         current: nsmGoals.mvpGoal,         source: "NSM Sheet" },
      { label: `NSM MVP ${mvpType} Actual`,       current: nsmGoals.mvpActual,       source: "NSM Sheet" },
      { label: `NSM MVP ${mvpType} %`,            current: nsmGoals.mvpPercent,      source: "NSM Sheet" },
      { label: `NSM MVP ${mvpType} On Track`,     current: nsmGoals.mvpOnTrack,      source: "NSM Sheet" },
    );
  }

  sections.push({
    id: "bw_pulse",
    type: "pulse",
    title: "Performance Pulse",
    metrics: pulseMetrics,
  });

  const publishedItems = allAirtableItems(publishedResult);
  const productionItems = allAirtableItems(productionResult);
  const airtableNotConfigured =
    (publishedResult.status === "fulfilled" && (publishedResult.value as any)?.setupRequired === true) ||
    publishedResult.status === "rejected";
  const noAirtable = airtableNotConfigured;

  const publishedContent = publishedItems.filter(i => isNewContentItem(i));
  const publishedOptimization = publishedItems.filter(i => isOptimizationItem(i));
  const productionContent = productionItems.filter(i => isNewContentItem(i));
  const productionOptimization = productionItems.filter(i => isOptimizationItem(i));

  const asanaData = asanaResult.status === "fulfilled" && asanaResult.value && (asanaResult.value as any).success
    ? (asanaResult.value as { success: true; completed: import("./asanaClient").AsanaTask[]; upcoming: import("./asanaClient").AsanaTask[] })
    : null;
  const asanaCompletedByCategory = asanaData ? groupAsanaTasks(asanaData.completed) : {};
  const asanaUpcomingByCategory = asanaData ? groupAsanaTasks(asanaData.upcoming) : {};

  const allSfReports = sfReportsResult.status === "fulfilled" ? (sfReportsResult.value ?? []) : [];
  const crawlReports = allSfReports.filter((r: any) => r.fileType !== "issues");
  const issuesReport = allSfReports.find((r: any) => r.fileType === "issues") ?? null;

  const hasSf = crawlReports.length > 0;
  const sfCounts = hasSf ? aggregateSfCounts(crawlReports) : null;

  let sfPriorities: string[];
  if (issuesReport) {
    const iHeaders: string[] = issuesReport.headers ?? [];
    const iRows: Record<string, any>[] = (issuesReport.data ?? []) as Record<string, any>[];
    const issueCol =
      iHeaders.find((h: string) => /^issue\s*name$/i.test(h)) ??
      iHeaders.find((h: string) => /^issue\s*type$/i.test(h)) ??
      iHeaders.find((h: string) => /^issue$/i.test(h)) ??
      iHeaders[0];
    const priorityCol = iHeaders.find((h: string) => /priority/i.test(h));
    const countCol =
      iHeaders.find((h: string) => /occurrence/i.test(h)) ??
      iHeaders.find((h: string) => /^count$/i.test(h)) ??
      iHeaders.find((h: string) => /^urls?$/i.test(h));
    const PRIO: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    const sorted = [...iRows].sort((a, b) => {
      const pa = PRIO[String(a[priorityCol ?? ""] ?? "").toLowerCase().trim()] ?? 4;
      const pb = PRIO[String(b[priorityCol ?? ""] ?? "").toLowerCase().trim()] ?? 4;
      return pa !== pb ? pa - pb : (Number(b[countCol ?? ""] ?? 0) - Number(a[countCol ?? ""] ?? 0));
    });
    const topIssues = sorted.slice(0, 2);
    sfPriorities = topIssues.map(r => {
      const name = String(r[issueCol] ?? "").trim() || "Unknown issue";
      const priority = priorityCol ? String(r[priorityCol] ?? "").trim() : "";
      const count = countCol ? Number(String(r[countCol] ?? "0").replace(/[^0-9.]/g, "")) || 0 : 0;
      return `${name}${priority ? ` [${priority}]` : ""}${count > 0 ? ` — ${count} occurrence${count !== 1 ? "s" : ""}` : ""}`;
    });
    if (sfPriorities.length === 0) sfPriorities = ["No active issues found in latest Screaming Frog Issues Report"];
  } else if (sfCounts) {
    sfPriorities = getSfTopPriorities(sfCounts);
  } else {
    sfPriorities = [
      "Upload a Screaming Frog crawl or Issues Report CSV to generate technical priorities",
      "Review Core Web Vitals for top service and location landing pages",
    ];
  }

  const snapshotKey = `sf_snapshot_${clientId}`;
  const prevSnapshotRaw = await storage.getSetting(snapshotKey);
  const prevSnapshot: SfIssueCounts & { date?: string } | null = prevSnapshotRaw ? JSON.parse(prevSnapshotRaw) : null;

  const sfDidItems: BulletItem[] = [];
  if (sfCounts && prevSnapshot) {
    const resolved = {
      canonical: Math.max(0, prevSnapshot.canonical - sfCounts.canonical),
      images: Math.max(0, prevSnapshot.images - sfCounts.images),
      errors404: Math.max(0, prevSnapshot.errors404 - sfCounts.errors404),
      missingMeta: Math.max(0, prevSnapshot.missingMeta - sfCounts.missingMeta),
    };
    if (resolved.canonical > 0) sfDidItems.push({ text: `Resolved ${resolved.canonical} canonical mismatches`, source: "Screaming Frog" });
    if (resolved.errors404 > 0) sfDidItems.push({ text: `Fixed ${resolved.errors404} broken links (404s)`, source: "Screaming Frog" });
    if (resolved.images > 0) sfDidItems.push({ text: `Optimized ${resolved.images} oversized images`, source: "Screaming Frog" });
    if (resolved.missingMeta > 0) sfDidItems.push({ text: `Added meta descriptions to ${resolved.missingMeta} priority pages`, source: "Screaming Frog" });
  }

  const asanaTechDid: BulletItem[] = (asanaCompletedByCategory["Technical SEO"] ?? []).map(t => ({ text: t.name, source: "Asana" }));
  const asanaTechNext: BulletItem[] = (asanaUpcomingByCategory["Technical SEO"] ?? []).map(t => ({ text: t.name, source: "Asana" }));

  const newContentDid: BulletItem[] = noAirtable ? [] : publishedContent.map(i => ({ text: i.task, url: i.url ?? undefined, source: "Airtable" }));
  const newContentNext: BulletItem[] = noAirtable ? [] : productionContent.map(i => ({ text: i.task, source: "Airtable" }));
  const optDid: BulletItem[] = noAirtable ? [] : publishedOptimization.map(i => ({ text: i.task, url: i.url ?? undefined, source: "Airtable" }));
  const optNext: BulletItem[] = noAirtable ? [] : productionOptimization.map(i => ({ text: i.task, source: "Airtable" }));

  const techDid: BulletItem[] = [...sfDidItems, ...asanaTechDid];
  const sfPrioritiesRich: BulletItem[] = sfPriorities.map(t => ({ text: t, source: hasSf ? "Screaming Frog" : undefined }));
  const techNext: BulletItem[] = sfPrioritiesRich.length > 0 ? sfPrioritiesRich : [...asanaTechNext];

  const workLog: NonNullable<DocxSection["workLog"]> = [
    makeRow(
      "Content",
      newContentDid,
      newContentNext,
      "Connect Airtable in Setup to pull live published content.",
      "Connect Airtable in Setup to pull upcoming content."
    ),
    makeRow(
      "Optimization",
      noAirtable ? [] : optDid,
      noAirtable ? [] : optNext,
      "Add optimization or refresh work completed this period.",
      "Add upcoming optimization or page refresh priorities."
    ),
    makeRow(
      "Technical SEO",
      techDid,
      techNext,
      "Add technical maintenance completed during this period.",
      techNext[0]?.text ?? "Review Core Web Vitals for top landing pages."
    ),
    makeRow(
      "Local SEO",
      [],
      [],
      "Add local SEO / GBP progress from the last two weeks.",
      "Add upcoming GBP / local SEO priorities."
    ),
  ];

  sections.push({
    id: "bw_progress",
    type: "progress",
    title: "Progress & Quick Wins",
    workLog,
  });

  sections.push({
    id: "bw_partnership",
    type: "bullets",
    title: "Partnership & Alignment",
    bullets: [
      "Open discussion: feedback, lead quality, new initiatives, or observations.",
      "Confirm next steps, responsibilities, and upcoming deliverables.",
    ],
  });

  if (sfCounts) {
    await storage.setSetting(snapshotKey, JSON.stringify({ ...sfCounts, date: now.toISOString() }));
  }

  const internalAmNotes = buildInternalAmNotes({
    clientName: client.name,
    nsmGoals,
    newContentDid,
    newContentNext,
    optDid,
    sfPriorities,
    hasSf,
    noAirtable,
    windowLabel,
  });

  return {
    report_title: "SEO Bi-weekly Meeting",
    client_name: client.name,
    date: fmtDate(now),
    reportingWindow: windowLabel,
    preparedBy: preparedBy || "JAY HALL",
    generated_at: now.toISOString(),
    sections,
    internalAmNotes,
  };
}
