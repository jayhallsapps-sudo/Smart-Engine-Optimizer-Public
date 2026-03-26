import type { Client, Command, CommandResult } from "@shared/schema";
import { storage } from "./storage";
import { decrypt } from "./encryption";
import { dateRangeToGoogleDates } from "./googleToken";

const ATTENTION_BASE = "https://api.attention.tech/v2";

async function getAttentionKey(): Promise<string | null> {
  const creds = await storage.getApiCredentialsByService("attention");
  if (!creds.length) return null;
  const keyCred = creds.find(c => c.credentialType === "api_key") ?? creds[0];
  try {
    return decrypt(keyCred.encryptedValue);
  } catch {
    console.warn("[Attention] Failed to decrypt API key — re-connect in Setup");
    return null;
  }
}

async function attentionGet(apiKey: string, path: string, params: Record<string, string> = {}): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const url = `${ATTENTION_BASE}/${path}${qs ? "?" + qs : ""}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });
  const data = await resp.json() as any;
  if (!resp.ok) {
    const errMsg = data?.message || data?.error || JSON.stringify(data);
    console.error(`[Attention] API error ${resp.status} for ${url}: ${errMsg}`);
    throw new Error(errMsg || `Attention API error ${resp.status}`);
  }
  return data;
}

const ATTENTION_COMMANDS: Command[] = [
  "attention_recent_conversations",
  "attention_call_summary",
];

export function handlesAttentionCommand(command: Command): boolean {
  return ATTENTION_COMMANDS.includes(command);
}

function fmtN(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function sentimentLabel(s: string | undefined): string {
  if (!s) return "Unknown";
  const lower = s.toLowerCase();
  if (lower.includes("positive")) return "Positive";
  if (lower.includes("negative")) return "Negative";
  if (lower.includes("neutral")) return "Neutral";
  return s;
}

export async function queryAttention(
  command: Command,
  client: Client,
  dateRange: string
): Promise<CommandResult | null> {
  if (!handlesAttentionCommand(command)) return null;

  const apiKey = await getAttentionKey();
  if (!apiKey) return null;

  const { startDate, endDate, prevStartDate, prevEndDate } = dateRangeToGoogleDates(dateRange);

  try {
    if (command === "attention_recent_conversations") {
      const params: Record<string, string> = {
        from_date: startDate,
        to_date: endDate,
        per_page: "100",
      };
      if (client.attentionAccountId) {
        params.account_id = client.attentionAccountId;
      }

      const [currData, prevData] = await Promise.all([
        attentionGet(apiKey, "conversations", params).catch(() => ({ conversations: [], total: 0 })),
        attentionGet(apiKey, "conversations", {
          ...params,
          from_date: prevStartDate,
          to_date: prevEndDate,
        }).catch(() => ({ conversations: [], total: 0 })),
      ]);

      const currConvos: any[] = currData.conversations ?? currData.data ?? [];
      const prevConvos: any[] = prevData.conversations ?? prevData.data ?? [];
      const currTotal = currData.total ?? currData.total_count ?? currConvos.length;
      const prevTotal = prevData.total ?? prevData.total_count ?? prevConvos.length;

      const sentimentCount = (convos: any[], label: string) =>
        convos.filter(c => {
          const s = c.extracted_intelligence?.call_sentiment ?? c.sentiment ?? "";
          return sentimentLabel(s) === label;
        }).length;

      const currPositive = sentimentCount(currConvos, "Positive");
      const currNegative = sentimentCount(currConvos, "Negative");
      const currNeutral = sentimentCount(currConvos, "Neutral");
      const prevPositive = sentimentCount(prevConvos, "Positive");

      const deltaTotal = currTotal - prevTotal;
      const deltaTotalPct = prevTotal > 0
        ? `${deltaTotal >= 0 ? "+" : ""}${Math.round((deltaTotal / prevTotal) * 100)}%`
        : currTotal > 0 ? "+100%" : "0%";

      const deltaPos = currPositive - prevPositive;
      const deltaPosPct = prevPositive > 0
        ? `${deltaPos >= 0 ? "+" : ""}${Math.round((deltaPos / prevPositive) * 100)}%`
        : currPositive > 0 ? "+100%" : "0%";

      const sentimentRows: (string | number)[][] = [
        ["Positive", fmtN(currPositive), currTotal > 0 ? `${Math.round((currPositive / currTotal) * 100)}%` : "–"],
        ["Neutral", fmtN(currNeutral), currTotal > 0 ? `${Math.round((currNeutral / currTotal) * 100)}%` : "–"],
        ["Negative", fmtN(currNegative), currTotal > 0 ? `${Math.round((currNegative / currTotal) * 100)}%` : "–"],
      ];

      return {
        command,
        clientName: client.name,
        dateRange,
        summary: [
          {
            label: "Total Conversations",
            current: fmtN(currTotal),
            previous: fmtN(prevTotal),
            delta: `${deltaTotal >= 0 ? "+" : ""}${fmtN(deltaTotal)}`,
            deltaPercent: deltaTotalPct,
            isPositive: deltaTotal >= 0,
          },
          {
            label: "Positive Sentiment",
            current: fmtN(currPositive),
            previous: fmtN(prevPositive),
            delta: `${deltaPos >= 0 ? "+" : ""}${fmtN(deltaPos)}`,
            deltaPercent: deltaPosPct,
            isPositive: deltaPos >= 0,
          },
        ],
        tables: [
          {
            title: "Sentiment Breakdown",
            headers: ["Sentiment", "Conversations", "% of Total"],
            rows: sentimentRows,
          },
        ],
      };
    }

    if (command === "attention_call_summary") {
      const params: Record<string, string> = {
        from_date: startDate,
        to_date: endDate,
        per_page: "20",
      };
      if (client.attentionAccountId) {
        params.account_id = client.attentionAccountId;
      }

      const currData = await attentionGet(apiKey, "conversations", params)
        .catch(() => ({ conversations: [], total: 0 }));

      const convos: any[] = currData.conversations ?? currData.data ?? [];

      const rows: (string | number)[][] = convos.slice(0, 15).map(c => {
        const intel = c.extracted_intelligence ?? {};
        const date = c.date ? new Date(c.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "–";
        const title = c.title ?? "Untitled Call";
        const sentiment = sentimentLabel(intel.call_sentiment ?? c.sentiment ?? "");
        const actionItems = Array.isArray(intel.action_items)
          ? intel.action_items.slice(0, 2).join("; ")
          : "–";
        const participants = Array.isArray(c.participants)
          ? c.participants.map((p: any) => p.name ?? p.email ?? "").filter(Boolean).join(", ")
          : "–";
        return [date, title, sentiment, participants, actionItems];
      });

      const total = currData.total ?? currData.total_count ?? convos.length;

      return {
        command,
        clientName: client.name,
        dateRange,
        summary: [
          {
            label: "Conversations Retrieved",
            current: fmtN(total),
            previous: "–",
            delta: "–",
            deltaPercent: "–",
            isPositive: true,
          },
        ],
        tables: [
          {
            title: "Recent Call Summaries",
            headers: ["Date", "Call Title", "Sentiment", "Participants", "Action Items"],
            rows: rows.length > 0 ? rows : [["No conversations found in this date range", "", "", "", ""]],
          },
        ],
      };
    }

    return null;
  } catch (err: any) {
    console.error(`[Attention] queryAttention error for ${command}:`, err.message);
    return null;
  }
}

export async function testAttentionConnection(apiKey: string): Promise<{ success: boolean; message: string }> {
  try {
    const data = await attentionGet(apiKey, "conversations", { per_page: "1" });
    const total = data.total ?? data.total_count ?? (data.conversations ?? data.data ?? []).length;
    return { success: true, message: `Connected — ${fmtN(total)} total conversation${total !== 1 ? "s" : ""} accessible` };
  } catch (err: any) {
    return { success: false, message: err.message ?? "Attention API connection failed" };
  }
}
