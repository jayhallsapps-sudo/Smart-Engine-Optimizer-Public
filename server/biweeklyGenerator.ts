import { storage } from "./storage";
import { queryGsc, handlesGscCommand } from "./gscClient";
import { queryGa4, handlesGa4Command } from "./ga4Client";
import { queryCallRail, handlesCallRailCommand } from "./callrailClient";
import { queryCtm, handlesCtmCommand } from "./ctmClient";
import { fetchAirtableWorkLog } from "./airtable";
import type { DocxSection } from "../client/src/components/report-preview/docx-preview";

export interface BiweeklyReportJson {
  report_title: string;
  client_name: string;
  date: string;
  attendees: string;
  generated_at: string;
  sections: DocxSection[];
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function get14DayWindow(): { start: string; end: string; label: string } {
  const end = new Date();
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - 13);
  const toYMD = (d: Date) => d.toISOString().slice(0, 10);
  return { start: toYMD(start), end: toYMD(end), label: `${fmtDate(start)} – ${fmtDate(end)}` };
}

function fmtNum(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return n.toString();
}

function pctStr(val: number, prev: number): { delta: string; isPositive: boolean } {
  if (!prev) return { delta: "—", isPositive: true };
  const d = ((val - prev) / prev) * 100;
  return { delta: `${Math.abs(d).toFixed(1)}%`, isPositive: d >= 0 };
}

export async function generateBiweekly(input: {
  clientId: number;
  timezone?: string;
}): Promise<BiweeklyReportJson> {
  const client = await storage.getClient(input.clientId);
  if (!client) throw new Error("Client not found: " + input.clientId);

  const window = get14DayWindow();
  const dateRange = "last_14_vs_prev_14";
  const now = new Date();

  const [gscResult, ga4Result, callTrackingResult, airtableResult] = await Promise.allSettled([
    (async () => {
      if (handlesGscCommand("gsc_qoq_queries" as any)) {
        return queryGsc("gsc_qoq_queries" as any, client, dateRange);
      }
      return null;
    })(),
    (async () => {
      if (handlesGa4Command("ga4_qoq_organic_funnel" as any)) {
        return queryGa4("ga4_qoq_organic_funnel" as any, client, dateRange);
      }
      return null;
    })(),
    (async () => {
      if (handlesCallRailCommand("callrail_qoq_organic_calls" as any)) {
        return queryCallRail("callrail_qoq_organic_calls" as any, client, dateRange);
      }
      if (handlesCtmCommand("ctm_calls_summary" as any)) {
        return queryCtm("ctm_calls_summary" as any, client, dateRange);
      }
      return null;
    })(),
    (async () => {
      const endDate = window.end;
      const startDate = window.start;
      return fetchAirtableWorkLog(client.id, startDate, endDate);
    })(),
  ]);

  const sections: DocxSection[] = [];

  const pulseMetrics: Array<{ label: string; current: string; previous?: string; delta?: string; isPositive?: boolean }> = [];

  if (gscResult.status === "fulfilled" && gscResult.value) {
    const gsc = gscResult.value;
    const summary = (gsc as any).summary ?? [];
    for (const s of summary) {
      pulseMetrics.push({
        label: s.label,
        current: s.current,
        previous: s.previous,
        delta: s.deltaPercent,
        isPositive: s.isPositive,
      });
    }
  }

  if (ga4Result.status === "fulfilled" && ga4Result.value) {
    const ga4 = ga4Result.value;
    const summary = (ga4 as any).summary ?? [];
    for (const s of summary) {
      pulseMetrics.push({
        label: s.label,
        current: s.current,
        previous: s.previous,
        delta: s.deltaPercent,
        isPositive: s.isPositive,
      });
    }
  }

  if (callTrackingResult.status === "fulfilled" && callTrackingResult.value) {
    const ct = callTrackingResult.value;
    const summary = (ct as any).summary ?? [];
    for (const s of summary) {
      pulseMetrics.push({
        label: s.label,
        current: s.current,
        previous: s.previous,
        delta: s.deltaPercent,
        isPositive: s.isPositive,
      });
    }
  }

  if (pulseMetrics.length === 0) {
    pulseMetrics.push(
      { label: "Organic Clicks", current: "—", previous: "—" },
      { label: "Organic Sessions", current: "—", previous: "—" },
      { label: "Conversions", current: "—", previous: "—" },
      { label: "Organic Calls", current: "—", previous: "—" },
    );
  }

  sections.push({
    id: "purpose",
    type: "bullets",
    title: "Purpose",
    bullets: [
      "To review recent SEO progress, share quick wins, and align on upcoming priorities that support your business goals.",
    ],
  });

  sections.push({
    id: "bw_pulse",
    type: "pulse",
    title: "Pulse — " + window.label,
    metrics: pulseMetrics,
  });

  let workLog: Array<{ area: string; whatWeDid: string; whatsNext: string }> = [];
  if (airtableResult.status === "fulfilled" && airtableResult.value?.success) {
    const data = airtableResult.value.data;
    for (const [creditType, items] of Object.entries(data.byCreditType)) {
      for (const item of items as any[]) {
        workLog.push({
          area: creditType,
          whatWeDid: item.task + (item.status ? ` [${item.status}]` : ""),
          whatsNext: item.url ?? "—",
        });
      }
    }
  }

  sections.push({
    id: "bw_progress",
    type: "progress",
    title: "Progress",
    workLog: workLog.length > 0 ? workLog : [
      { area: "Content", whatWeDid: "Connect Airtable in Setup to pull live work log data.", whatsNext: "—" },
    ],
  });

  sections.push({
    id: "bw_partnership",
    type: "bullets",
    title: "Partnership",
    bullets: [
      "Review upcoming content calendar and confirm approval queue.",
      "Confirm technical fix tickets in backlog.",
      "Align on next bi-weekly check-in date and agenda items.",
    ],
  });

  return {
    report_title: "SEO Bi-weekly Meeting",
    client_name: client.name,
    date: fmtDate(now),
    attendees: "",
    generated_at: now.toISOString(),
    sections,
  };
}
