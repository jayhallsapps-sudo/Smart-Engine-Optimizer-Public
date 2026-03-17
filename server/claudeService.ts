/**
 * ACA — Ask Claude Anything
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-side Claude integration using the Anthropic SDK with tool use.
 * Claude can call into any SmartEO data source to answer user questions.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import * as cheerio from "cheerio";
import { setAiActive } from "./aiProvider";
import { storage } from "./storage";
import { queryGsc, handlesGscCommand } from "./gscClient";
import { queryGa4, handlesGa4Command } from "./ga4Client";
import { queryCallRail, handlesCallRailCommand } from "./callrailClient";
import { queryCtm, handlesCtmCommand } from "./ctmClient";
import { querySemrush, handlesSemrushCommand } from "./semrushClient";
import { queryAhrefs, handlesAhrefsCommand } from "./ahrefsClient";
import { queryGbp } from "./gbpClient";
import { querySfReport, handlesSfCommand } from "./sfClient";
import { fetchAirtableWorkLog } from "./airtable";
import { fetchAsanaOpenTasks, fetchAsanaWorkLog } from "./asanaClient";
import { fetchNsmGoals, fetchNsmGoalsForSpecificQuarter } from "./sheetsClient";
import { fetchStrategyBank } from "./notionClient";
import { fetchQssbData } from "./qssbClient";
import type { Client, Command, CommandResult } from "@shared/schema";

// ─── Anthropic client ────────────────────────────────────────────────────────

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is not set. Add it in Replit Secrets.");
  }
  return new Anthropic({ apiKey });
}

// ─── Integration → tool mapping ──────────────────────────────────────────────

const INTEGRATION_TO_TOOLS: Record<string, string[]> = {
  gsc: ["query_google_search_console"],
  ga4: ["query_google_analytics"],
  callrail: ["query_callrail"],
  ctm: ["query_ctm"],
  semrush: ["query_semrush"],
  ahrefs: ["query_ahrefs"],
  gbp: ["query_gbp"],
  screaming_frog: ["query_screaming_frog"],
  airtable: ["get_airtable_work_log"],
  asana: ["get_asana_tasks"],
  nsm_goals: ["get_nsm_goals"],
  strategy_bank: ["get_notion_strategy_bank"],
  website: ["query_website"],
};

const ALWAYS_AVAILABLE_TOOLS = [
  "list_clients",
  "get_client_details",
  "get_saved_reports",
  "get_query_history",
];

function getFilteredTools(integrations?: string[]): Anthropic.Tool[] {
  if (!integrations || integrations.length === 0) return ACA_TOOLS;
  const allowed = new Set(ALWAYS_AVAILABLE_TOOLS);
  for (const key of integrations) {
    const tools = INTEGRATION_TO_TOOLS[key];
    if (tools) tools.forEach((t) => allowed.add(t));
  }
  return ACA_TOOLS.filter((t) => allowed.has(t.name));
}

// ─── OpenAI-compatible tool definitions ─────────────────────────────────────
// Converts ACA_TOOLS (Anthropic format) to OpenAI function-calling format.

function toOpenAITools(tools: Anthropic.Tool[]): OpenAI.Chat.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema as Record<string, unknown>,
    },
  }));
}

// ─── OpenAI-compatible agentic loop (Groq or OpenAI) ────────────────────────

async function runWithOpenAICompatible(
  provider: "groq" | "openai",
  messages: AcaMessage[],
  clientContext?: ClientContext,
  integrations?: string[],
  onToolCall?: (toolName: string, toolInput: Record<string, any>) => void
): Promise<string> {
  let oaiClient: OpenAI;
  let model: string;

  if (provider === "groq") {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY not configured");
    oaiClient = new OpenAI({ apiKey, baseURL: "https://api.groq.com/openai/v1" });
    model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  } else {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
    oaiClient = new OpenAI({ apiKey });
    model = process.env.OPENAI_MODEL || "gpt-4o";
  }

  const systemPrompt = buildSystemPrompt(clientContext, integrations);
  const filteredTools = getFilteredTools(integrations);
  const oaiTools = toOpenAITools(filteredTools);

  type OAIMessage = OpenAI.Chat.ChatCompletionMessageParam;
  const apiMessages: OAIMessage[] = [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  for (let i = 0; i < 15; i++) {
    const completion = await oaiClient.chat.completions.create({
      model,
      messages: apiMessages,
      tools: oaiTools,
      tool_choice: "auto",
      max_tokens: 4096,
    });

    const choice = completion.choices[0];
    if (!choice) throw new Error("No response from provider");

    const msg = choice.message;
    apiMessages.push(msg as OAIMessage);

    // No tool calls — we have a final answer
    if (choice.finish_reason !== "tool_calls" || !msg.tool_calls || msg.tool_calls.length === 0) {
      return msg.content || "No response generated.";
    }

    // Execute each requested tool call
    for (const toolCall of msg.tool_calls) {
      const toolName = toolCall.function.name;
      let toolInput: Record<string, any> = {};
      try {
        toolInput = JSON.parse(toolCall.function.arguments || "{}");
      } catch {
        toolInput = {};
      }

      if (onToolCall) onToolCall(toolName, toolInput);
      console.log(`[ACA/${provider}] Calling tool: ${toolName}`, JSON.stringify(toolInput).slice(0, 200));

      const result = await executeTool(toolName, toolInput);

      apiMessages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result,
      } as OAIMessage);
    }
  }

  return "I ran into an issue processing your request — too many data lookups were needed. Try asking a more specific question.";
}

// ─── Tool definitions ────────────────────────────────────────────────────────

const ACA_TOOLS: Anthropic.Tool[] = [
  {
    name: "list_clients",
    description: "List all clients configured in SmartEO with their names, IDs, and connected data sources.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_client_details",
    description: "Get full details for a specific client including all connected data source IDs, brand terms, lead events, money pages, and goals.",
    input_schema: {
      type: "object" as const,
      properties: {
        client_id: { type: "number", description: "The client ID" },
      },
      required: ["client_id"],
    },
  },
  {
    name: "query_google_search_console",
    description: "Query Google Search Console data for a client. Available commands: gsc_qoq_queries (query performance QoQ), gsc_qoq_pages (page performance QoQ), gsc_top_queries (top queries with deltas), gsc_query_to_page_map (which queries drive which pages), gsc_high_impressions_low_ctr (CTR opportunities), gsc_high_traffic_low_cvr (high traffic low conversion pages), gsc_indexation_stability (indexed vs excluded pages).",
    input_schema: {
      type: "object" as const,
      properties: {
        client_id: { type: "number", description: "The client ID" },
        command: {
          type: "string",
          description: "The GSC command to run",
          enum: ["gsc_qoq_queries", "gsc_qoq_pages", "gsc_top_queries", "gsc_query_to_page_map", "gsc_high_impressions_low_ctr", "gsc_high_traffic_low_cvr", "gsc_indexation_stability"],
        },
        date_range: {
          type: "string",
          description: "Date range. Presets: last_14_vs_prev_14, last_30_vs_prev_30, last_90_vs_prev_90 (default), last_365_vs_prev_365, qtd. Custom: custom:YYYY-MM-DD:YYYY-MM-DD (e.g. custom:2026-01-01:2026-03-15). Use custom when user specifies exact dates.",
        },
      },
      required: ["client_id", "command"],
    },
  },
  {
    name: "query_google_analytics",
    description: "Query Google Analytics 4 data for a client. Available commands: ga4_qoq_organic_funnel (organic sessions/users/conversions QoQ), ga4_qoq_organic_landing_pages (landing page performance QoQ), ga4_combined_funnel (sessions + forms + calls + CVR snapshot), ga4_qtd_totals (quarter-to-date vs goal), ga4_landing_pages_by_sessions (top pages by traffic), ga4_landing_pages_by_conversions (top pages by leads), ga4_session_movers (pages gaining/losing sessions), ga4_conversion_movers (pages gaining/losing conversions), ga4_yoy_comparison (year-over-year monthly).",
    input_schema: {
      type: "object" as const,
      properties: {
        client_id: { type: "number", description: "The client ID" },
        command: {
          type: "string",
          description: "The GA4 command to run",
          enum: ["ga4_qoq_organic_funnel", "ga4_qoq_organic_landing_pages", "ga4_combined_funnel", "ga4_qtd_totals", "ga4_landing_pages_by_sessions", "ga4_landing_pages_by_conversions", "ga4_session_movers", "ga4_conversion_movers", "ga4_yoy_comparison"],
        },
        date_range: {
          type: "string",
          description: "Date range. Presets: last_14_vs_prev_14, last_30_vs_prev_30, last_90_vs_prev_90 (default), last_365_vs_prev_365, qtd. Custom: custom:YYYY-MM-DD:YYYY-MM-DD (e.g. custom:2026-01-01:2026-03-15). Use custom when user specifies exact dates.",
        },
      },
      required: ["client_id", "command"],
    },
  },
  {
    name: "query_callrail",
    description: "Query CallRail call tracking data. Available commands: callrail_qoq_organic_calls (organic call volume QoQ), callrail_qoq_top_landing_pages (top landing pages by calls), callrail_summary (answered rate, qualified calls, sources).",
    input_schema: {
      type: "object" as const,
      properties: {
        client_id: { type: "number", description: "The client ID" },
        command: {
          type: "string",
          description: "The CallRail command to run",
          enum: ["callrail_qoq_organic_calls", "callrail_qoq_top_landing_pages", "callrail_summary"],
        },
        date_range: {
          type: "string",
          description: "Date range. Presets: last_14_vs_prev_14, last_30_vs_prev_30, last_90_vs_prev_90 (default, use for 'this quarter'), last_365_vs_prev_365. Custom: custom:YYYY-MM-DD:YYYY-MM-DD (e.g. custom:2026-01-01:2026-03-15). Use custom when user asks for specific start/end dates.",
        },
      },
      required: ["client_id", "command"],
    },
  },
  {
    name: "query_ctm",
    description: "Query CallTrackingMetrics data. Available commands: ctm_qoq_organic_calls (organic call volume QoQ), ctm_qoq_top_landing_pages (top landing pages by calls).",
    input_schema: {
      type: "object" as const,
      properties: {
        client_id: { type: "number", description: "The client ID" },
        command: {
          type: "string",
          description: "The CTM command to run",
          enum: ["ctm_qoq_organic_calls", "ctm_qoq_top_landing_pages"],
        },
        date_range: {
          type: "string",
          description: "Date range. Presets: last_14_vs_prev_14, last_30_vs_prev_30, last_90_vs_prev_90 (default), last_365_vs_prev_365. Custom: custom:YYYY-MM-DD:YYYY-MM-DD. Use custom when user specifies exact dates.",
        },
      },
      required: ["client_id", "command"],
    },
  },
  {
    name: "query_semrush",
    description: "Query SEMrush competitive intelligence data. Available commands: semrush_organic_overview (organic traffic estimates), semrush_keyword_rankings (keyword positions), semrush_keyword_distribution (ranking tiers: top 3/10/20/100), semrush_competitor_visibility (share of voice vs competitors).",
    input_schema: {
      type: "object" as const,
      properties: {
        client_id: { type: "number", description: "The client ID" },
        command: {
          type: "string",
          description: "The SEMrush command to run",
          enum: ["semrush_organic_overview", "semrush_keyword_rankings", "semrush_keyword_distribution", "semrush_competitor_visibility"],
        },
        date_range: {
          type: "string",
          description: "Date range. Presets: last_30_vs_prev_30, last_90_vs_prev_90 (default), last_365_vs_prev_365. Custom: custom:YYYY-MM-DD:YYYY-MM-DD. Use custom when user specifies exact dates.",
        },
      },
      required: ["client_id", "command"],
    },
  },
  {
    name: "query_ahrefs",
    description: "Query Ahrefs backlink and keyword data. Available commands: ahrefs_backlink_overview (referring domains, domain rating), ahrefs_keyword_rankings (keyword positions), ahrefs_competitor_visibility (competitor comparison).",
    input_schema: {
      type: "object" as const,
      properties: {
        client_id: { type: "number", description: "The client ID" },
        command: {
          type: "string",
          description: "The Ahrefs command to run",
          enum: ["ahrefs_backlink_overview", "ahrefs_keyword_rankings", "ahrefs_competitor_visibility"],
        },
        date_range: {
          type: "string",
          description: "Date range. Presets: last_30_vs_prev_30, last_90_vs_prev_90 (default), last_365_vs_prev_365. Custom: custom:YYYY-MM-DD:YYYY-MM-DD. Use custom when user specifies exact dates.",
        },
      },
      required: ["client_id", "command"],
    },
  },
  {
    name: "query_gbp",
    description: "Query Google Business Profile data for a client — reviews, star ratings, local performance (calls, directions, website clicks).",
    input_schema: {
      type: "object" as const,
      properties: {
        client_id: { type: "number", description: "The client ID" },
        date_range: {
          type: "string",
          description: "Date range. Presets: last_30_vs_prev_30, last_90_vs_prev_90 (default), last_365_vs_prev_365. Custom: custom:YYYY-MM-DD:YYYY-MM-DD. Use custom when user specifies exact dates.",
        },
      },
      required: ["client_id"],
    },
  },
  {
    name: "query_screaming_frog",
    description: "Query uploaded Screaming Frog crawl data. Available commands: technical_health_summary (overall site health), sf_issues_summary (issues by priority), core_web_vitals (CWV trend), new_pages_tracker (new/updated pages).",
    input_schema: {
      type: "object" as const,
      properties: {
        client_id: { type: "number", description: "The client ID" },
        command: {
          type: "string",
          description: "The SF command to run",
          enum: ["technical_health_summary", "sf_issues_summary", "core_web_vitals", "new_pages_tracker"],
        },
      },
      required: ["client_id", "command"],
    },
  },
  {
    name: "get_airtable_work_log",
    description: "Get the Airtable work log for a client — shows work completed, deliverables shipped, tasks done, organized by category and credit type.",
    input_schema: {
      type: "object" as const,
      properties: {
        client_id: { type: "number", description: "The client ID" },
      },
      required: ["client_id"],
    },
  },
  {
    name: "get_asana_tasks",
    description: "Get open Asana tasks for a client — shows current to-do items, their status, and assignees.",
    input_schema: {
      type: "object" as const,
      properties: {
        client_id: { type: "number", description: "The client ID" },
      },
      required: ["client_id"],
    },
  },
  {
    name: "get_nsm_goals",
    description: "Get the NSM (North Star Metric) goals from Google Sheets for a client — shows sessions goal/actual, MVP type and goal/actual, on-track status, and credits.",
    input_schema: {
      type: "object" as const,
      properties: {
        client_name: { type: "string", description: "The client name (must match the NSM tracker sheet)" },
        quarter: { type: "number", description: "Quarter number (1-4). If omitted, uses current quarter." },
        year: { type: "number", description: "Year. If omitted, uses current year." },
      },
      required: ["client_name"],
    },
  },
  {
    name: "get_notion_strategy_bank",
    description: "Get the Notion Strategy Bank — contains strategy recommendations, service offerings, and playbook entries organized by category.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_saved_reports",
    description: "Get previously saved reports for a client — shows report history with dates, types, and names.",
    input_schema: {
      type: "object" as const,
      properties: {
        client_id: { type: "number", description: "The client ID" },
        report_type: {
          type: "string",
          description: "Filter by report type. If omitted, returns all types.",
          enum: ["biweekly", "monthly", "qbr_full", "qbr_prep", "mid_strategy"],
        },
      },
      required: ["client_id"],
    },
  },
  {
    name: "get_query_history",
    description: "Get past ACA/query history — shows what questions have been asked and their results.",
    input_schema: {
      type: "object" as const,
      properties: {
        client_id: { type: "number", description: "Optional: filter by client ID" },
        limit: { type: "number", description: "Max results to return. Default: 20" },
      },
      required: [],
    },
  },
  {
    name: "query_website",
    description: "Fetch and analyze a client's live website for SEO issues. Retrieves page HTML and extracts meta tags, headings, content structure, internal/external links, and on-page SEO signals. Also pulls the most recent Screaming Frog crawl data if available.",
    input_schema: {
      type: "object" as const,
      properties: {
        client_id: { type: "number", description: "The client ID" },
        url: { type: "string", description: "Specific URL to analyze. If omitted, uses the client's primary site URL." },
        analysis_type: {
          type: "string",
          description: "What kind of analysis to perform",
          enum: ["seo_audit", "meta_tags", "headings", "content", "links", "full_page"],
        },
      },
      required: ["client_id"],
    },
  },
];

// ─── Tool execution ──────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  input: Record<string, any>
): Promise<string> {
  try {
    switch (name) {
      case "list_clients": {
        const clients = await storage.getClients();
        return JSON.stringify(
          clients.map((c) => ({
            id: c.id,
            name: c.name,
            gsc: !!c.gscSiteUrl,
            ga4: !!c.ga4PropertyId,
            callrail: !!c.callrailCompanyId,
            ctm: !!c.ctmAccountId,
            ahrefs: !!c.ahrefsProjectUrl,
            semrush: !!c.semrushProjectId,
            gbp: !!c.gbpLocationName,
            airtable: !!c.airtableBaseId,
            asana: !!c.asanaProjectId,
            primaryGoal: c.primaryGoal || null,
          }))
        );
      }

      case "get_client_details": {
        const client = await storage.getClient(input.client_id);
        if (!client) return JSON.stringify({ error: "Client not found" });
        return JSON.stringify({
          id: client.id,
          name: client.name,
          gscSiteUrl: client.gscSiteUrl,
          ga4PropertyId: client.ga4PropertyId,
          callrailCompanyId: client.callrailCompanyId,
          callrailAccountId: client.callrailAccountId,
          ctmAccountId: client.ctmAccountId,
          ahrefsProjectUrl: client.ahrefsProjectUrl,
          semrushProjectId: client.semrushProjectId,
          gbpLocationName: client.gbpLocationName,
          gbpProfileUrl: client.gbpProfileUrl,
          airtableBaseId: client.airtableBaseId,
          airtableTableName: client.airtableTableName,
          asanaProjectId: client.asanaProjectId,
          brandTerms: client.brandTerms,
          leadEvents: client.leadEvents,
          moneyPages: client.moneyPages,
          primaryGoal: client.primaryGoal,
          aboutPageUrl: client.aboutPageUrl,
        });
      }

      case "query_google_search_console": {
        const client = await storage.getClient(input.client_id);
        if (!client) return JSON.stringify({ error: "Client not found" });
        const result = await queryGsc(
          input.command as Command,
          client,
          input.date_range || "last_90_vs_prev_90"
        );
        if (!result) return JSON.stringify({ error: "GSC not configured or no data available for this client" });
        return JSON.stringify(result);
      }

      case "query_google_analytics": {
        const client = await storage.getClient(input.client_id);
        if (!client) return JSON.stringify({ error: "Client not found" });
        const result = await queryGa4(
          input.command as Command,
          client,
          input.date_range || "last_90_vs_prev_90"
        );
        if (!result) return JSON.stringify({ error: "GA4 not configured or no data available for this client" });
        return JSON.stringify(result);
      }

      case "query_callrail": {
        const client = await storage.getClient(input.client_id);
        if (!client) return JSON.stringify({ error: "Client not found" });
        const result = await queryCallRail(
          input.command as Command,
          client,
          input.date_range || "last_90_vs_prev_90"
        );
        if (!result) return JSON.stringify({ error: "CallRail not configured or no data available for this client" });
        return JSON.stringify(result);
      }

      case "query_ctm": {
        const client = await storage.getClient(input.client_id);
        if (!client) return JSON.stringify({ error: "Client not found" });
        const result = await queryCtm(
          input.command as Command,
          client,
          input.date_range || "last_90_vs_prev_90"
        );
        if (!result) return JSON.stringify({ error: "CTM not configured or no data available for this client" });
        return JSON.stringify(result);
      }

      case "query_semrush": {
        const client = await storage.getClient(input.client_id);
        if (!client) return JSON.stringify({ error: "Client not found" });
        const result = await querySemrush(
          input.command as Command,
          client,
          input.date_range || "last_90_vs_prev_90"
        );
        if (!result) return JSON.stringify({ error: "SEMrush not configured or no data available for this client" });
        return JSON.stringify(result);
      }

      case "query_ahrefs": {
        const client = await storage.getClient(input.client_id);
        if (!client) return JSON.stringify({ error: "Client not found" });
        const result = await queryAhrefs(
          input.command as Command,
          client,
          input.date_range || "last_90_vs_prev_90"
        );
        if (!result) return JSON.stringify({ error: "Ahrefs not configured or no data available for this client" });
        return JSON.stringify(result);
      }

      case "query_gbp": {
        const client = await storage.getClient(input.client_id);
        if (!client) return JSON.stringify({ error: "Client not found" });
        const result = await queryGbp(
          "gbp_local_summary" as Command,
          client,
          input.date_range || "last_90_vs_prev_90"
        );
        if (!result) return JSON.stringify({ error: "GBP not configured or no data available for this client" });
        return JSON.stringify(result);
      }

      case "query_screaming_frog": {
        const client = await storage.getClient(input.client_id);
        if (!client) return JSON.stringify({ error: "Client not found" });
        const result = await querySfReport(
          input.command as Command,
          client,
          "last_90_vs_prev_90"
        );
        if (!result) return JSON.stringify({ error: "No Screaming Frog data uploaded for this client" });
        return JSON.stringify(result);
      }

      case "get_airtable_work_log": {
        const client = await storage.getClient(input.client_id);
        if (!client) return JSON.stringify({ error: "Client not found" });
        if (!client.airtableBaseId) return JSON.stringify({ error: "Airtable not configured for this client" });
        const workLog = await fetchAirtableWorkLog(client);
        return JSON.stringify(workLog);
      }

      case "get_asana_tasks": {
        const client = await storage.getClient(input.client_id);
        if (!client) return JSON.stringify({ error: "Client not found" });
        if (!client.asanaProjectId) return JSON.stringify({ error: "Asana not configured for this client" });
        const tasks = await fetchAsanaOpenTasks(client.asanaProjectId);
        return JSON.stringify(tasks);
      }

      case "get_nsm_goals": {
        if (input.quarter && input.year) {
          const data = await fetchNsmGoalsForSpecificQuarter(
            input.client_name,
            input.quarter,
            input.year
          );
          return JSON.stringify(data);
        }
        const data = await fetchNsmGoals(input.client_name);
        return JSON.stringify(data);
      }

      case "get_notion_strategy_bank": {
        const data = await fetchStrategyBank();
        return JSON.stringify(data);
      }

      case "get_saved_reports": {
        const { listSavedReportsByClient, listSavedReportsByClientAndType } = await import("./savedReportService");
        let reports;
        if (input.report_type) {
          reports = await listSavedReportsByClientAndType(input.client_id, input.report_type);
        } else {
          reports = await listSavedReportsByClient(input.client_id);
        }
        // Return metadata only, not full report JSON
        return JSON.stringify(
          reports.map((r: any) => ({
            id: r.id,
            reportType: r.reportType,
            reportName: r.reportName,
            reportPeriodLabel: r.reportPeriodLabel,
            generatedOn: r.generatedOn,
            createdAt: r.createdAt,
          }))
        );
      }

      case "get_query_history": {
        const logs = await storage.getQueryLogs(input.client_id, input.limit || 20);
        return JSON.stringify(logs);
      }

      case "query_website": {
        const client = await storage.getClient(input.client_id);
        if (!client) return JSON.stringify({ error: "Client not found" });

        const targetUrl = input.url || client.gscSiteUrl || client.aboutPageUrl;
        if (!targetUrl) return JSON.stringify({ error: "No website URL configured for this client." });

        const results: any = { url: targetUrl, analysisType: input.analysis_type || "seo_audit" };

        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          const resp = await fetch(targetUrl, {
            headers: { "User-Agent": "SmartEO-Bot/1.0" },
            signal: controller.signal,
          });
          clearTimeout(timeout);
          const html = await resp.text();
          const $ = cheerio.load(html);

          results.live = {
            statusCode: resp.status,
            title: $("title").text().trim(),
            metaDescription: $('meta[name="description"]').attr("content") || null,
            metaRobots: $('meta[name="robots"]').attr("content") || null,
            canonical: $('link[rel="canonical"]').attr("href") || null,
            ogTitle: $('meta[property="og:title"]').attr("content") || null,
            ogDescription: $('meta[property="og:description"]').attr("content") || null,
            ogImage: $('meta[property="og:image"]').attr("content") || null,
            h1: $("h1").map((_, el) => $(el).text().trim()).get(),
            h2: $("h2").map((_, el) => $(el).text().trim()).get(),
            h3Count: $("h3").length,
            h4Count: $("h4").length,
            imgWithoutAlt: $("img:not([alt]), img[alt='']").length,
            totalImages: $("img").length,
            internalLinks: $(`a[href^='/'], a[href^='${targetUrl}']`).length,
            externalLinks: $("a[href^='http']").not(`a[href^='${targetUrl}']`).length,
            wordCount: $("body").text().replace(/\s+/g, " ").trim().split(" ").length,
            hasStructuredData: $('script[type="application/ld+json"]').length > 0,
            schemaTypes: $('script[type="application/ld+json"]')
              .map((_, el) => {
                try { const parsed = JSON.parse($(el).html() || "{}"); return parsed["@type"] || null; } catch { return null; }
              })
              .get()
              .filter(Boolean),
          };
        } catch (err: any) {
          results.live = { error: `Failed to fetch website: ${err.message}` };
        }

        try {
          const sfResult = await querySfReport("technical_health_summary" as Command, client, "last_90_vs_prev_90");
          results.screamingFrog = sfResult || { note: "No Screaming Frog data uploaded for this client" };
        } catch {
          results.screamingFrog = { note: "No Screaming Frog data available" };
        }

        return JSON.stringify(results);
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err: any) {
    console.error(`[ACA] Tool ${name} failed:`, err.message);
    return JSON.stringify({ error: `Tool ${name} failed: ${err.message}` });
  }
}

// ─── System prompt ───────────────────────────────────────────────────────────

const ACA_SYSTEM_PROMPT_BASE = `You are the SmartEO AI Assistant — an expert SEO analyst embedded inside the Smart Engine Optimizer platform built by Webserv (Sync Digital Solutions).

You have access to live data from all connected integrations:
- Google Search Console (GSC): search queries, pages, clicks, impressions, CTR, position
- Google Analytics 4 (GA4): organic sessions, users, conversions, landing pages, funnels
- CallRail: call tracking, organic calls, qualified leads, landing page attribution
- CallTrackingMetrics (CTM): call tracking, form fills, source attribution
- SEMrush: organic keywords, traffic estimates, competitor visibility, ranking distribution
- Ahrefs: backlinks, referring domains, domain rating, keyword rankings
- Google Business Profile (GBP): reviews, local insights, calls, directions
- Screaming Frog: technical SEO crawl data, issues, CWV
- Airtable: work logs, deliverables, task tracking
- Asana: open tasks, project status
- Google Sheets (NSM Tracker): North Star Metric goals, sessions/MVP targets, on-track status
- Notion (Strategy Bank): strategy recommendations, playbooks, service offerings

IMPORTANT RULES:
1. ALWAYS call the appropriate tool(s) before answering any data question. Never guess or make up numbers.
2. Present data clearly — use actual numbers, deltas, and percentages from the tool results.
3. When comparing periods, explain whether metrics are up or down and by how much.
4. If a data source isn't configured for a client, say so clearly rather than failing silently.
5. You can and should call multiple tools in sequence to build a comprehensive answer.
6. When asked about "calls" or "admits" or "conversions", check both CallRail and CTM — use whichever is configured.
7. For quarter performance, use the ga4_qtd_totals or ga4_qoq_organic_funnel commands.
8. For historical context, pull data across multiple date ranges to show trends.
9. Be direct, specific, and actionable. You're talking to SEO professionals at an agency.
10. DATE RANGES: Use preset values (last_90_vs_prev_90, etc.) for general queries. When the user specifies exact dates (e.g. "from January 1 to today"), use the custom format: custom:YYYY-MM-DD:YYYY-MM-DD (e.g. custom:2026-01-01:2026-03-15). NEVER invent non-standard date range strings.
11. Do NOT output placeholder text like "assuming the query is successful" or "let me fetch that" — just call the tool and report actual results.`;

export interface ClientContext {
  id: number;
  name: string;
}

function buildSystemPrompt(clientContext?: ClientContext, integrations?: string[]): string {
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  let prompt = ACA_SYSTEM_PROMPT_BASE;

  if (clientContext) {
    prompt += `

ACTIVE CLIENT CONTEXT:
The user has selected "${clientContext.name}" (ID: ${clientContext.id}) as the active client.
- ALL queries should be scoped to this client unless the user explicitly asks about a different client or all clients.
- When using any tool that requires a client_id, use ${clientContext.id}.
- When using get_nsm_goals, use client_name "${clientContext.name}".
- Do NOT ask the user which client they mean — they have already selected ${clientContext.name}.
- Do NOT call list_clients unless the user asks to switch clients or asks about all clients.
- Start by getting this client's details if you need to know what data sources are connected.`;
  } else {
    prompt += `

NO CLIENT SELECTED:
The user has not selected a specific client. If their question is about a specific client, call list_clients first to see what's available, then ask which client they mean. If they ask about all clients, query each one.`;
  }

  if (integrations && integrations.length > 0) {
    prompt += `

SELECTED INTEGRATIONS:
The user has selected the following data sources to query: ${integrations.join(", ")}.
Focus on data from these sources. If data from an unselected source would be helpful, mention that to the user but do not query it.`;
  }

  prompt += `

Today's date is ${today}.`;

  return prompt;
}

// ─── Chat interface ──────────────────────────────────────────────────────────

export interface AcaMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Run a full ACA conversation turn with multi-provider fallback.
 * Tries Claude → Groq → OpenAI in order. Any failure on one provider
 * is logged and the next one is attempted.
 */
export async function runAcaChat(
  messages: AcaMessage[],
  clientContext?: ClientContext,
  integrations?: string[],
  onToolCall?: (toolName: string, toolInput: Record<string, any>) => void
): Promise<{ response: string; provider: string }> {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      console.log("[ACA] Trying provider: claude");
      setAiActive("claude", true);
      try {
        const response = await runWithClaude(messages, clientContext, integrations, onToolCall);
        return { response, provider: "claude" };
      } finally {
        setAiActive("claude", false);
      }
    } catch (err: any) {
      console.error("[ACA] Claude failed:", err?.status, err?.message?.slice(0, 200));
    }
  }
  if (process.env.GROQ_API_KEY) {
    try {
      console.log("[ACA] Trying provider: groq");
      setAiActive("groq", true);
      try {
        const response = await runWithOpenAICompatible("groq", messages, clientContext, integrations, onToolCall);
        return { response, provider: "groq" };
      } finally {
        setAiActive("groq", false);
      }
    } catch (err: any) {
      console.error("[ACA] Groq failed:", err?.status, err?.message?.slice(0, 200));
    }
  }
  if (process.env.OPENAI_API_KEY) {
    try {
      console.log("[ACA] Trying provider: openai");
      setAiActive("openai", true);
      try {
        const response = await runWithOpenAICompatible("openai", messages, clientContext, integrations, onToolCall);
        return { response, provider: "openai" };
      } finally {
        setAiActive("openai", false);
      }
    } catch (err: any) {
      console.error("[ACA] OpenAI failed:", err?.status, err?.message?.slice(0, 200));
    }
  }
  throw new Error(
    "All AI providers failed or are unconfigured. Add at least one API key in Secrets: ANTHROPIC_API_KEY, GROQ_API_KEY, or OPENAI_API_KEY."
  );
}

async function runWithClaude(
  messages: AcaMessage[],
  clientContext?: ClientContext,
  integrations?: string[],
  onToolCall?: (toolName: string, toolInput: Record<string, any>) => void
): Promise<string> {
  const anthropic = getAnthropicClient();
  const systemPrompt = buildSystemPrompt(clientContext, integrations);
  const tools = getFilteredTools(integrations);

  const apiMessages: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  for (let i = 0; i < 15; i++) {
    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages: apiMessages,
    });

    if (response.stop_reason === "end_turn") {
      const textBlocks = response.content.filter(
        (b): b is Anthropic.TextBlock => b.type === "text"
      );
      return textBlocks.map((b) => b.text).join("\n\n");
    }

    if (response.stop_reason === "tool_use") {
      apiMessages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type === "tool_use") {
          if (onToolCall) onToolCall(block.name, block.input as Record<string, any>);
          console.log(`[ACA] Calling tool: ${block.name}`, JSON.stringify(block.input).slice(0, 200));
          const result = await executeTool(block.name, block.input as Record<string, any>);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result,
          });
        }
      }

      apiMessages.push({ role: "user", content: toolResults });
    }
  }

  return "I ran into an issue processing your request — too many data lookups were needed. Try asking a more specific question.";
}

/**
 * Stream an ACA conversation turn.
 * Returns an async generator that yields partial text as Claude streams its response.
 * Handles the tool-use loop internally.
 */
export async function* streamAcaChat(
  messages: AcaMessage[],
  clientContext?: ClientContext,
  onToolCall?: (toolName: string, toolInput: Record<string, any>) => void
): AsyncGenerator<string, void, unknown> {
  const anthropic = getAnthropicClient();
  const systemPrompt = buildSystemPrompt(clientContext);

  const apiMessages: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  for (let i = 0; i < 15; i++) {
    // First, make a non-streaming call to check if tool use is needed
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      tools: ACA_TOOLS,
      messages: apiMessages,
    });

    if (response.stop_reason === "tool_use") {
      // Handle tool calls silently
      apiMessages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type === "tool_use") {
          if (onToolCall) onToolCall(block.name, block.input as Record<string, any>);
          console.log(`[ACA] Calling tool: ${block.name}`, JSON.stringify(block.input).slice(0, 200));

          // Yield a status message so the UI can show what's happening
          yield `\n<!-- tool:${block.name} -->\n`;

          const result = await executeTool(block.name, block.input as Record<string, any>);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result,
          });
        }
      }

      apiMessages.push({ role: "user", content: toolResults });
      continue;
    }

    // Final response — stream the text
    if (response.stop_reason === "end_turn") {
      for (const block of response.content) {
        if (block.type === "text") {
          yield block.text;
        }
      }
      return;
    }
  }

  yield "I ran into an issue — too many lookups needed. Try a more specific question.";
}
