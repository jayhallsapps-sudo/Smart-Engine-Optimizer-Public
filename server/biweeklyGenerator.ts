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
  sourceFacts?: BiweeklySourceFacts;
}

export interface BiweeklySourceFacts {
  windowLabel: string;
  newContentDid: string[];
  newContentNext: string[];
  optDid: string[];
  optNext: string[];
  techDid: string[];
  techNext: string[];
  localDid: string[];
  localNext: string[];
  strategyDid?: string[];
  strategyNext?: string[];
  hasSf: boolean;
  noAirtable: boolean;
  sfIssueCounts: SfIssueCounts | null;
  aiNarrationUsed: boolean;
  aiNarrationProvider?: string;
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

const GOOGLE_DOC_URL_RE = /docs\.google\.com|drive\.google\.com/i;

function hasContentDoc(item: WorkLogItem): boolean {
  return !!(item.contentDocUrl && GOOGLE_DOC_URL_RE.test(item.contentDocUrl));
}

// Bi-Weekly v2 classification — driven by Airtable Credit type field.
// Content: Scale, Half Scale, Service
// Optimization: Optimization, CRO Update
// Signature: explicitly ignored
const CONTENT_CREDIT_TYPES = new Set(["Scale", "Half Scale", "Service"]);
const OPTIMIZATION_CREDIT_TYPES = new Set(["Optimization", "CRO Update"]);

function isContentItem(item: WorkLogItem): boolean {
  return CONTENT_CREDIT_TYPES.has(item.creditType);
}

function isOptimizationItem(item: WorkLogItem): boolean {
  return OPTIMIZATION_CREDIT_TYPES.has(item.creditType);
}

// Slug rendering — 4-step fallback chain per Bi-Weekly v2 spec.
// 1. URL Slug populated -> use it (ensure leading and trailing slash)
// 2. Else extract path from Final URL; if empty/just-slashes -> "Homepage"
// 3. Else if task name contains "homepage" -> "Homepage"
// 4. Else use task name as last-resort fallback
function renderSlug(item: WorkLogItem): string {
  const slug = item.urlSlug?.trim();
  if (slug && slug.length > 0) {
    // Normalize: ensure leading slash, ensure trailing slash
    let normalized = slug.startsWith("/") ? slug : `/${slug}`;
    if (!normalized.endsWith("/")) normalized = `${normalized}/`;
    return normalized;
  }

  const finalUrl = item.url?.trim();
  if (finalUrl && finalUrl.length > 0) {
    try {
      const u = new URL(finalUrl);
      let path = u.pathname;
      // Collapse multiple slashes (e.g. "//" -> "/")
      path = path.replace(/\/+/g, "/");
      if (path === "" || path === "/") return "Homepage";
      // Ensure trailing slash
      if (!path.endsWith("/")) path = `${path}/`;
      return path;
    } catch {
      // URL constructor failed — fall through
    }
  }

  const taskName = item.task?.trim() ?? "";
  if (taskName.toLowerCase().includes("homepage")) return "Homepage";

  return taskName || "Untitled";
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
  noAirtable: boolean;
  windowLabel: string;
}): InternalAmNotes {
  const { clientName, nsmGoals, newContentDid, newContentNext, optDid, noAirtable, windowLabel } = params;

  const missingInputs: string[] = [];
  if (noAirtable) missingInputs.push("Airtable not connected — content rows will be empty");
  if (!nsmGoals || (!nsmGoals.sessionsGoal || nsmGoals.sessionsGoal === "—")) missingInputs.push("NSM sheet data not found — verify Google Sheets connection");

  const talkingPoints: string[] = [];
  if (nsmGoals && nsmGoals.sessionsActual && nsmGoals.sessionsGoal && nsmGoals.sessionsActual !== "—" && nsmGoals.sessionsGoal !== "—") {
    talkingPoints.push(`Organic sessions pacing: ${nsmGoals.sessionsActual} vs ${nsmGoals.sessionsGoal} goal (${nsmGoals.sessionsPercent ?? "?"}%)`);
  }
  if (newContentDid.length > 0) talkingPoints.push(`${newContentDid.length} content item${newContentDid.length !== 1 ? "s" : ""} published/completed this period`);
  if (optDid.length > 0) talkingPoints.push(`${optDid.length} optimization item${optDid.length !== 1 ? "s" : ""} completed`);
  if (newContentNext.length > 0) talkingPoints.push(`${newContentNext.length} content item${newContentNext.length !== 1 ? "s" : ""} planned for the next 2 weeks`);

  const risksCarryForwards: string[] = [];
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

// ─── Main generator ───────────────────────────────────────────────────────────

export async function generateBiweekly(input: {
  clientId: number;
  startDate: string;
  endDate: string;
  preparedBy: string;
  // Optional date-window overrides (AM can adjust coverage dates in the report editor).
  // If not provided, startDate/endDate are used as the "Did" window.
  // The "Next" window is always the 14 days immediately following the "Did" window's endDate.
  windowStart?: string;
  windowEnd?: string;
}): Promise<BiweeklyReportJson> {
  const { clientId, preparedBy } = input;
  const startDate = input.windowStart ?? input.startDate;
  const endDate = input.windowEnd ?? input.endDate;
  const client = await storage.getClient(clientId);
  if (!client) throw new Error("Client not found: " + clientId);

  const windowLabel = makeWindowLabel(startDate, endDate);
  const now = new Date();

  const asanaProjectId = (client as any).asanaProjectId as string | null | undefined;

  const nextStart = endDate;
  const nextEndDate = new Date(parseDateStr(endDate).getTime() + 14 * 24 * 60 * 60 * 1000);
  const nextEnd = `${nextEndDate.getFullYear()}-${String(nextEndDate.getMonth() + 1).padStart(2, "0")}-${String(nextEndDate.getDate()).padStart(2, "0")}`;

  const [didAirtableResult, nextAirtableResult, sfReportsResult, nsmResult, asanaResult] =
    await Promise.allSettled([
      // "What we did" — content that was produced and posted in the reporting window.
      // Queries the client's Published view, filtered on "Last Published / Updated".
      fetchAirtableWorkLog(clientId, startDate, endDate, "biweekly_did"),
      // "What's next" — content still to be produced in the upcoming window.
      // Queries the client's Production view, filtered on "Due".
      fetchAirtableWorkLog(clientId, nextStart, nextEnd, "biweekly_next"),
      storage.getSfReports(clientId),
      fetchNsmGoals(client.name),
      asanaProjectId ? fetchAsanaWorkLog(asanaProjectId, startDate, nextEnd) : Promise.resolve(null),
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
    // Two rows: Organic Sessions, and Organic + GMB + AI/LLM Calls (MVP).
    // Each "current" field encodes "Goal | Actual | % | Status" so the renderer can split it.
    const sessionsPct = parseFloat(String(nsmGoals.sessionsPercent ?? "").replace(/[^0-9.]/g, "")) || 0;
    const callsPct = parseFloat(String(nsmGoals.mvpPercent ?? "").replace(/[^0-9.]/g, "")) || 0;
    pulseMetrics.push(
      {
        label: "Organic Sessions",
        current: `${nsmGoals.sessionsGoal} | ${nsmGoals.sessionsActual} | ${nsmGoals.sessionsPercent} | ${sessionsPct >= 100 ? "Ahead" : "Behind"}`,
        isPositive: sessionsPct >= 100,
        source: "NSM Sheet",
      },
      {
        label: `Organic + GMB + AI/LLM ${mvpType}`,
        current: `${nsmGoals.mvpGoal} | ${nsmGoals.mvpActual} | ${nsmGoals.mvpPercent} | ${callsPct >= 100 ? "Ahead" : "Behind"}`,
        isPositive: callsPct >= 100,
        source: "NSM Sheet",
      },
    );
  } else {
    // NSM missing: emit a single warning row. The renderer should display this loudly (red banner).
    pulseMetrics.push({
      label: "⚠ NSM data missing",
      current: `NSM data could not be loaded for ${client.name}. Verify the NSM Sheet is connected for this client.`,
      source: "NSM Sheet",
    });
  }

  sections.push({
    id: "bw_pulse",
    type: "pulse",
    title: "Performance Pulse",
    metrics: pulseMetrics,
  });

  const didItems = allAirtableItems(didAirtableResult);
  const nextItems = allAirtableItems(nextAirtableResult);
  const airtableNotConfigured =
    (didAirtableResult.status === "fulfilled" && (didAirtableResult.value as any)?.setupRequired === true) ||
    didAirtableResult.status === "rejected";
  const noAirtable = airtableNotConfigured;

  const publishedContent = didItems.filter(i => isContentItem(i));
  const publishedOptimization = didItems.filter(i => isOptimizationItem(i));
  const productionContent = nextItems.filter(i => isContentItem(i));
  const productionOptimization = nextItems.filter(i => isOptimizationItem(i));

  console.log(
    `[Biweekly] Content/Opt split — published: ${publishedContent.length} content, ${publishedOptimization.length} opt` +
    ` | production: ${productionContent.length} content, ${productionOptimization.length} opt` +
    ` | urlSlug signal used: ${[...didItems, ...nextItems].filter(i => !!i.urlSlug).length}/${didItems.length + nextItems.length} records`
  );

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

  const currentSnapshotKey = `sf_snapshot_${clientId}_${startDate}`;
  const prevSnapshotKey = `sf_snapshot_${clientId}_prev`;
  const currentSnapshotRaw = await storage.getSetting(currentSnapshotKey);
  const prevSnapshotRaw = currentSnapshotRaw
    ? currentSnapshotRaw
    : await storage.getSetting(prevSnapshotKey);
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

  // Bi-Weekly v2: render Airtable items as slugs only, with action-verb prefix in the "Did" column.
  const newContentDid: BulletItem[] = noAirtable ? [] : publishedContent.map(i => ({ text: `Published ${renderSlug(i)}`, url: i.url ?? undefined, source: "Airtable" }));
  const newContentNext: BulletItem[] = noAirtable ? [] : productionContent.map(i => ({ text: renderSlug(i), source: "Airtable" }));
  const optDid: BulletItem[] = noAirtable ? [] : publishedOptimization.map(i => ({ text: `Optimized ${renderSlug(i)}`, url: i.url ?? undefined, source: "Airtable" }));
  const optNext: BulletItem[] = noAirtable ? [] : productionOptimization.map(i => ({ text: renderSlug(i), source: "Airtable" }));

  const techDid: BulletItem[] = [...asanaTechDid];
  const techNext: BulletItem[] = [...asanaTechNext];

  const asanaLocalDid: BulletItem[] = (asanaCompletedByCategory["Local SEO"] ?? []).map(t => ({ text: t.name, source: "Asana" }));
  const asanaLocalNext: BulletItem[] = (asanaUpcomingByCategory["Local SEO"] ?? []).map(t => ({ text: t.name, source: "Asana" }));
  const asanaStrategyDid: BulletItem[] = (asanaCompletedByCategory["SEO Strategy"] ?? []).map(t => ({ text: t.name, source: "Asana" }));
  const asanaStrategyNext: BulletItem[] = (asanaUpcomingByCategory["SEO Strategy"] ?? []).map(t => ({ text: t.name, source: "Asana" }));

  // No AI narration in Bi-Weekly v2 — raw items pass through to the renderer.
  // B3b will replace the per-item rendering with slug-based formatting.
  const finalNewContentDid  = newContentDid;
  const finalNewContentNext = newContentNext;
  const finalOptDid         = optDid;
  const finalOptNext        = optNext;
  const finalTechDid        = techDid;
  const finalTechNext       = techNext;
  const finalLocalDid       = asanaLocalDid;
  const finalLocalNext      = asanaLocalNext;

  const EMPTY_CELL = "No updates for this section at this time.";

  const workLog: NonNullable<DocxSection["workLog"]> = [
    makeRow("Content", finalNewContentDid, finalNewContentNext, EMPTY_CELL, EMPTY_CELL),
    makeRow("Optimization", finalOptDid, finalOptNext, EMPTY_CELL, EMPTY_CELL),
    makeRow("Technical SEO", finalTechDid, finalTechNext, EMPTY_CELL, EMPTY_CELL),
    makeRow("Local SEO", finalLocalDid, finalLocalNext, EMPTY_CELL, EMPTY_CELL),
  ];

  // Bi-Weekly v2: SEO Strategy row only appears when it has at least one task in either column.
  if (asanaStrategyDid.length > 0 || asanaStrategyNext.length > 0) {
    workLog.push(
      makeRow("SEO Strategy", asanaStrategyDid, asanaStrategyNext, EMPTY_CELL, EMPTY_CELL)
    );
  }

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
    const snapshotPayload = JSON.stringify({ ...sfCounts, date: now.toISOString(), periodStart: startDate });
    await storage.setSetting(currentSnapshotKey, snapshotPayload);
    if (!currentSnapshotRaw) {
      await storage.setSetting(prevSnapshotKey, snapshotPayload);
    }
  }

  const internalAmNotes = buildInternalAmNotes({
    clientName: client.name,
    nsmGoals,
    newContentDid,
    newContentNext,
    optDid,
    noAirtable,
    windowLabel,
  });

  const sourceFacts: BiweeklySourceFacts = {
    windowLabel,
    newContentDid: newContentDid.map(i => i.text),
    newContentNext: newContentNext.map(i => i.text),
    optDid: optDid.map(i => i.text),
    optNext: optNext.map(i => i.text),
    techDid: techDid.map(i => i.text),
    techNext: techNext.map(i => i.text),
    localDid: asanaLocalDid.map(i => i.text),
    localNext: asanaLocalNext.map(i => i.text),
    strategyDid: asanaStrategyDid.map(i => i.text),
    strategyNext: asanaStrategyNext.map(i => i.text),
    hasSf,
    noAirtable,
    sfIssueCounts: sfCounts,
    aiNarrationUsed: false,
  };

  return {
    report_title: `${client.name} — Bi-Weekly SEO Report`,
    client_name: client.name,
    date: fmtDate(now),
    reportingWindow: windowLabel,
    preparedBy,
    generated_at: now.toISOString(),
    sections,
    internalAmNotes,
    sourceFacts,
  };
}
