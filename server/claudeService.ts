/**
 * AMA — Ask Me Anything
 * ─────────────────────────────────────────────────────────────────────────────
 * Multi-provider AI assistant with tool use, streaming, and conversation logging.
 * Providers (in fallback order): Groq → Gemini → OpenAI → Perplexity
 * Claude is intentionally not used.
 */

import OpenAI from "openai";
import * as cheerio from "cheerio";
import { setAiActive } from "./aiProvider";
import { storage } from "./storage";
import { queryGsc } from "./gscClient";
import { queryGa4 } from "./ga4Client";
import { queryCallRail } from "./callrailClient";
import { queryCtm } from "./ctmClient";
import { querySemrush } from "./semrushClient";
import { queryAhrefs } from "./ahrefsClient";
import { queryGbp } from "./gbpClient";
import { querySfReport } from "./sfClient";
import { fetchAirtableWorkLog } from "./airtable";
import { fetchAsanaOpenTasks } from "./asanaClient";
import { fetchNsmGoals, fetchNsmGoalsForSpecificQuarter } from "./sheetsClient";
import { fetchStrategyBank } from "./notionClient";
import type { Client, Command } from "@shared/schema";

// ─── Provider client factory ──────────────────────────────────────────────────

type Provider = "groq" | "gemini" | "openai" | "perplexity";

interface ProviderConfig {
  client: OpenAI;
  model: string;
}

function getProviderConfig(provider: Provider): ProviderConfig {
  switch (provider) {
    case "groq": {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) throw new Error("GROQ_API_KEY not configured");
      return {
        client: new OpenAI({ apiKey, baseURL: "https://api.groq.com/openai/v1" }),
        model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      };
    }
    case "gemini": {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
      return {
        client: new OpenAI({ apiKey, baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/" }),
        model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
      };
    }
    case "openai": {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
      return {
        client: new OpenAI({ apiKey }),
        model: process.env.OPENAI_MODEL || "gpt-4o",
      };
    }
    case "perplexity": {
      const apiKey = process.env.PERPLEXITY_API_KEY;
      if (!apiKey) throw new Error("PERPLEXITY_API_KEY not configured");
      return {
        client: new OpenAI({ apiKey, baseURL: "https://api.perplexity.ai" }),
        model: process.env.PERPLEXITY_MODEL || "sonar",
      };
    }
  }
}

function getProviderChain(): Provider[] {
  const order: Provider[] = ["groq", "gemini", "openai", "perplexity"];
  return order.filter((p) => {
    try { getProviderConfig(p); return true; } catch { return false; }
  });
}

// ─── Integration → tool mapping ───────────────────────────────────────────────

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

function getFilteredTools(integrations?: string[]): OpenAI.Chat.ChatCompletionTool[] {
  const allTools = toOpenAITools(ACA_TOOLS_ANTHROPIC_FORMAT);
  if (!integrations || integrations.length === 0) return allTools;
  const allowed = new Set(ALWAYS_AVAILABLE_TOOLS);
  for (const key of integrations) {
    const tools = INTEGRATION_TO_TOOLS[key];
    if (tools) tools.forEach((t) => allowed.add(t));
  }
  return allTools.filter((t) => allowed.has((t as any).function?.name));
}

// ─── Tool definitions (OpenAI format) ────────────────────────────────────────

interface AnthroCTool {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

function toOpenAITools(tools: AnthroCTool[]): OpenAI.Chat.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema as Record<string, unknown>,
    },
  }));
}

const ACA_TOOLS_ANTHROPIC_FORMAT: AnthroCTool[] = [
  {
    name: "list_clients",
    description: "List all clients configured in SmartEO with their names, IDs, and connected data sources.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_client_details",
    description: "Get full details for a specific client including all connected data source IDs, brand terms, lead events, money pages, and goals.",
    input_schema: {
      type: "object",
      properties: { client_id: { type: "number", description: "The client ID" } },
      required: ["client_id"],
    },
  },
  {
    name: "query_google_search_console",
    description: "Query Google Search Console data for a client. Available commands: gsc_qoq_queries (query performance QoQ), gsc_qoq_pages (page performance QoQ), gsc_top_queries (top queries with deltas), gsc_query_to_page_map (which queries drive which pages), gsc_high_impressions_low_ctr (CTR opportunities), gsc_high_traffic_low_cvr (high traffic low conversion pages), gsc_indexation_stability (indexed vs excluded pages).",
    input_schema: {
      type: "object",
      properties: {
        client_id: { type: "number", description: "The client ID" },
        command: {
          type: "string",
          description: "The GSC command to run",
          enum: ["gsc_qoq_queries", "gsc_qoq_pages", "gsc_top_queries", "gsc_query_to_page_map", "gsc_high_impressions_low_ctr", "gsc_high_traffic_low_cvr", "gsc_indexation_stability"],
        },
        date_range: {
          type: "string",
          description: "Date range. Presets: last_14_vs_prev_14, last_30_vs_prev_30, last_90_vs_prev_90 (default), last_365_vs_prev_365, qtd. Custom: custom:YYYY-MM-DD:YYYY-MM-DD.",
        },
      },
      required: ["client_id", "command"],
    },
  },
  {
    name: "query_google_analytics",
    description: "Query Google Analytics 4 data for a client. Available commands: ga4_qoq_organic_funnel (organic sessions/users/conversions QoQ), ga4_qoq_organic_landing_pages (landing page performance QoQ), ga4_combined_funnel (sessions + forms + calls + CVR snapshot), ga4_qtd_totals (quarter-to-date vs goal), ga4_landing_pages_by_sessions (top pages by traffic), ga4_landing_pages_by_conversions (top pages by leads), ga4_session_movers (pages gaining/losing sessions), ga4_conversion_movers (pages gaining/losing conversions), ga4_yoy_comparison (year-over-year monthly).",
    input_schema: {
      type: "object",
      properties: {
        client_id: { type: "number", description: "The client ID" },
        command: {
          type: "string",
          description: "The GA4 command to run",
          enum: ["ga4_qoq_organic_funnel", "ga4_qoq_organic_landing_pages", "ga4_combined_funnel", "ga4_qtd_totals", "ga4_landing_pages_by_sessions", "ga4_landing_pages_by_conversions", "ga4_session_movers", "ga4_conversion_movers", "ga4_yoy_comparison"],
        },
        date_range: {
          type: "string",
          description: "Date range. Presets: last_14_vs_prev_14, last_30_vs_prev_30, last_90_vs_prev_90 (default), last_365_vs_prev_365, qtd. Custom: custom:YYYY-MM-DD:YYYY-MM-DD.",
        },
      },
      required: ["client_id", "command"],
    },
  },
  {
    name: "query_callrail",
    description: "Query CallRail call tracking data. Available commands: callrail_qoq_organic_calls (organic call volume QoQ), callrail_qoq_top_landing_pages (top landing pages by calls), callrail_summary (answered rate, qualified calls, sources).",
    input_schema: {
      type: "object",
      properties: {
        client_id: { type: "number", description: "The client ID" },
        command: {
          type: "string",
          enum: ["callrail_qoq_organic_calls", "callrail_qoq_top_landing_pages", "callrail_summary"],
        },
        date_range: { type: "string", description: "Date range preset or custom:YYYY-MM-DD:YYYY-MM-DD" },
      },
      required: ["client_id", "command"],
    },
  },
  {
    name: "query_ctm",
    description: "Query CallTrackingMetrics data. Available commands: ctm_qoq_organic_calls (organic call volume QoQ), ctm_qoq_top_landing_pages (top landing pages by calls).",
    input_schema: {
      type: "object",
      properties: {
        client_id: { type: "number", description: "The client ID" },
        command: { type: "string", enum: ["ctm_qoq_organic_calls", "ctm_qoq_top_landing_pages"] },
        date_range: { type: "string" },
      },
      required: ["client_id", "command"],
    },
  },
  {
    name: "query_semrush",
    description: "Query SEMrush competitive intelligence data. Available commands: semrush_organic_overview, semrush_keyword_rankings, semrush_keyword_distribution, semrush_competitor_visibility.",
    input_schema: {
      type: "object",
      properties: {
        client_id: { type: "number", description: "The client ID" },
        command: { type: "string", enum: ["semrush_organic_overview", "semrush_keyword_rankings", "semrush_keyword_distribution", "semrush_competitor_visibility"] },
        date_range: { type: "string" },
      },
      required: ["client_id", "command"],
    },
  },
  {
    name: "query_ahrefs",
    description: "Query Ahrefs backlink and keyword data. Available commands: ahrefs_backlink_overview, ahrefs_keyword_rankings, ahrefs_competitor_visibility.",
    input_schema: {
      type: "object",
      properties: {
        client_id: { type: "number", description: "The client ID" },
        command: { type: "string", enum: ["ahrefs_backlink_overview", "ahrefs_keyword_rankings", "ahrefs_competitor_visibility"] },
        date_range: { type: "string" },
      },
      required: ["client_id", "command"],
    },
  },
  {
    name: "query_gbp",
    description: "Query Google Business Profile data — reviews, star ratings, local performance (calls, directions, website clicks).",
    input_schema: {
      type: "object",
      properties: {
        client_id: { type: "number", description: "The client ID" },
        date_range: { type: "string" },
      },
      required: ["client_id"],
    },
  },
  {
    name: "query_screaming_frog",
    description: "Query uploaded Screaming Frog crawl data. Available commands: technical_health_summary, sf_issues_summary, core_web_vitals, new_pages_tracker.",
    input_schema: {
      type: "object",
      properties: {
        client_id: { type: "number", description: "The client ID" },
        command: { type: "string", enum: ["technical_health_summary", "sf_issues_summary", "core_web_vitals", "new_pages_tracker"] },
      },
      required: ["client_id", "command"],
    },
  },
  {
    name: "get_airtable_work_log",
    description: "Get the Airtable work log for a client — shows work completed, deliverables shipped, tasks done, organized by category and credit type. Returns all available records.",
    input_schema: {
      type: "object",
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
      type: "object",
      properties: { client_id: { type: "number", description: "The client ID" } },
      required: ["client_id"],
    },
  },
  {
    name: "get_nsm_goals",
    description: "Get the NSM (North Star Metric) goals from Google Sheets for a client — shows sessions goal/actual, MVP type and goal/actual, on-track status, and credits.",
    input_schema: {
      type: "object",
      properties: {
        client_id: { type: "number", description: "The client ID" },
        quarter: { type: "number", description: "Quarter number (1-4). If omitted, uses current quarter." },
        year: { type: "number", description: "Year. If omitted, uses current year." },
      },
      required: ["client_id"],
    },
  },
  {
    name: "get_notion_strategy_bank",
    description: "Get the Notion Strategy Bank — contains strategy recommendations, service offerings, and playbook entries organized by category.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_saved_reports",
    description: "Get previously saved reports for a client — shows report history with dates, types, and names.",
    input_schema: {
      type: "object",
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
    description: "Get past AMA query history — shows what questions have been asked and their results.",
    input_schema: {
      type: "object",
      properties: {
        client_id: { type: "number", description: "Optional: filter by client ID" },
        limit: { type: "number", description: "Max results to return. Default: 20" },
      },
      required: [],
    },
  },
  {
    name: "query_website",
    description: "Fetch and analyze a client's live website page HTML for on-page SEO signals: meta tags, headings, content structure, internal/external links. Use ONLY for on-page content analysis. Do NOT use for traffic, rankings, conversions, clicks, impressions, CTR, or page performance.",
    input_schema: {
      type: "object",
      properties: {
        client_id: { type: "number", description: "The client ID" },
        url: { type: "string", description: "Specific URL to analyze. If omitted, uses the client's primary site URL." },
        analysis_type: {
          type: "string",
          enum: ["seo_audit", "meta_tags", "headings", "content", "links", "full_page"],
        },
      },
      required: ["client_id"],
    },
  },
];

// ─── Tool execution ───────────────────────────────────────────────────────────

export interface ToolCallRecord {
  name: string;
  input: Record<string, any>;
  result: string;
}

async function executeTool(name: string, input: Record<string, any>): Promise<string> {
  try {
    switch (name) {
      case "list_clients": {
        const clients = await storage.getClients();
        return JSON.stringify(
          clients.map((c) => ({
            id: c.id, name: c.name,
            gsc: !!c.gscSiteUrl, ga4: !!c.ga4PropertyId,
            callrail: !!c.callrailCompanyId, ctm: !!c.ctmAccountId,
            ahrefs: !!c.ahrefsProjectUrl, semrush: !!c.semrushProjectId,
            gbp: !!c.gbpLocationName, airtable: !!c.airtableBaseId,
            asana: !!c.asanaProjectId, primaryGoal: c.primaryGoal || null,
          }))
        );
      }

      case "get_client_details": {
        const client = await storage.getClient(input.client_id);
        if (!client) return JSON.stringify({ error: "Client not found" });
        return JSON.stringify({
          id: client.id, name: client.name,
          gscSiteUrl: client.gscSiteUrl, ga4PropertyId: client.ga4PropertyId,
          callrailCompanyId: client.callrailCompanyId, callrailAccountId: client.callrailAccountId,
          ctmAccountId: client.ctmAccountId, ahrefsProjectUrl: client.ahrefsProjectUrl,
          semrushProjectId: client.semrushProjectId, gbpLocationName: client.gbpLocationName,
          gbpProfileUrl: client.gbpProfileUrl, airtableBaseId: client.airtableBaseId,
          airtableTableName: client.airtableTableName, asanaProjectId: client.asanaProjectId,
          brandTerms: client.brandTerms, leadEvents: client.leadEvents,
          moneyPages: client.moneyPages, primaryGoal: client.primaryGoal,
          aboutPageUrl: client.aboutPageUrl,
        });
      }

      case "query_google_search_console": {
        const client = await storage.getClient(input.client_id);
        if (!client) return JSON.stringify({ error: "Client not found" });
        if (!client.gscSiteUrl) return JSON.stringify({ error: `GSC is not configured for ${client.name} — no site URL is set in client settings.` });
        const result = await queryGsc(input.command as Command, client, input.date_range || "last_90_vs_prev_90");
        if (!result) return JSON.stringify({ error: `GSC returned no data for ${client.name}. The stored Google credentials may not have access to this property, or no data exists for the requested date range.` });
        return JSON.stringify(result);
      }

      case "query_google_analytics": {
        const client = await storage.getClient(input.client_id);
        if (!client) return JSON.stringify({ error: "Client not found" });
        if (!client.ga4PropertyId) return JSON.stringify({ error: `GA4 is not configured for ${client.name} — no property ID is set in client settings.` });
        try {
          const result = await queryGa4(input.command as Command, client, input.date_range || "last_90_vs_prev_90");
          if (!result) return JSON.stringify({ error: `GA4 returned no data for ${client.name} (property: ${client.ga4PropertyId}).` });
          return JSON.stringify(result);
        } catch (ga4Err: any) {
          const msg = ga4Err.message || "";
          const lmsg = msg.toLowerCase();
          if (lmsg.includes("permission") || lmsg.includes("forbidden") || lmsg.includes("403") || lmsg.includes("insufficient") || lmsg.includes("not authorized")) {
            return JSON.stringify({ error: `GA4 property ${client.ga4PropertyId} is not accessible with the stored credentials. Check client settings and verify the Google account has access to this GA4 property.` });
          }
          if (lmsg.includes("no credentials") || lmsg.includes("no valid credentials")) {
            return JSON.stringify({ error: `GA4 credentials are not configured or could not be refreshed. Go to Setup to reconnect Google Analytics.` });
          }
          return JSON.stringify({ error: `GA4 query failed for ${client.name}: ${msg}` });
        }
      }

      case "query_callrail": {
        const client = await storage.getClient(input.client_id);
        if (!client) return JSON.stringify({ error: "Client not found" });
        if (!client.callrailCompanyId) return JSON.stringify({ error: `CallRail is not configured for ${client.name} — no company ID set. Try CTM instead, or add the company ID in client settings.` });
        const result = await queryCallRail(input.command as Command, client, input.date_range || "last_90_vs_prev_90");
        if (!result) return JSON.stringify({ error: `CallRail returned no data for ${client.name}. The API key may not be configured or company ID ${client.callrailCompanyId} may not be accessible.` });
        return JSON.stringify(result);
      }

      case "query_ctm": {
        const client = await storage.getClient(input.client_id);
        if (!client) return JSON.stringify({ error: "Client not found" });
        const result = await queryCtm(input.command as Command, client, input.date_range || "last_90_vs_prev_90");
        if (!result) return JSON.stringify({ error: "CTM not configured or no data available for this client" });
        return JSON.stringify(result);
      }

      case "query_semrush": {
        const client = await storage.getClient(input.client_id);
        if (!client) return JSON.stringify({ error: "Client not found" });
        const result = await querySemrush(input.command as Command, client, input.date_range || "last_90_vs_prev_90");
        if (!result) return JSON.stringify({ error: "SEMrush not configured or no data available for this client" });
        return JSON.stringify(result);
      }

      case "query_ahrefs": {
        const client = await storage.getClient(input.client_id);
        if (!client) return JSON.stringify({ error: "Client not found" });
        const result = await queryAhrefs(input.command as Command, client, input.date_range || "last_90_vs_prev_90");
        if (!result) return JSON.stringify({ error: "Ahrefs not configured or no data available for this client" });
        return JSON.stringify(result);
      }

      case "query_gbp": {
        const client = await storage.getClient(input.client_id);
        if (!client) return JSON.stringify({ error: "Client not found" });
        const result = await queryGbp("gbp_local_summary" as Command, client, input.date_range || "last_90_vs_prev_90");
        if (!result) return JSON.stringify({ error: "GBP not configured or no data available for this client" });
        return JSON.stringify(result);
      }

      case "query_screaming_frog": {
        const client = await storage.getClient(input.client_id);
        if (!client) return JSON.stringify({ error: "Client not found" });
        const result = await querySfReport(input.command as Command, client, "last_90_vs_prev_90");
        if (!result) return JSON.stringify({ error: "No Screaming Frog data uploaded for this client" });
        return JSON.stringify(result);
      }

      case "get_airtable_work_log": {
        const client = await storage.getClient(input.client_id);
        if (!client) return JSON.stringify({ error: "Client not found" });
        if (!client.airtableBaseId) return JSON.stringify({ error: `Airtable is not configured for ${client.name} — no Base ID is set in client settings.` });
        const now = new Date();
        const endDate = now.toISOString().slice(0, 10);
        const startDate = new Date(now.getTime() - 365 * 86400000).toISOString().slice(0, 10);
        const result = await fetchAirtableWorkLog(client.id, startDate, endDate);
        if (!result.success) return JSON.stringify({ error: result.error });
        return JSON.stringify(result.data);
      }

      case "get_asana_tasks": {
        const client = await storage.getClient(input.client_id);
        if (!client) return JSON.stringify({ error: "Client not found" });
        if (!client.asanaProjectId) return JSON.stringify({ error: "Asana not configured for this client" });
        const tasks = await fetchAsanaOpenTasks(client.asanaProjectId);
        return JSON.stringify(tasks);
      }

      case "get_nsm_goals": {
        const client = await storage.getClient(input.client_id);
        if (!client) return JSON.stringify({ error: "Client not found" });
        if (input.quarter && input.year) {
          const data = await fetchNsmGoalsForSpecificQuarter(client.name, input.quarter, input.year);
          return JSON.stringify(data);
        }
        const data = await fetchNsmGoals(client.name);
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
        return JSON.stringify(
          reports.map((r: any) => ({
            id: r.id, reportType: r.reportType, reportName: r.reportName,
            reportPeriodLabel: r.reportPeriodLabel, generatedOn: r.generatedOn, createdAt: r.createdAt,
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
          const resp = await fetch(targetUrl, { headers: { "User-Agent": "SmartEO-Bot/1.0" }, signal: controller.signal });
          clearTimeout(timeout);
          const html = await resp.text();
          const $ = cheerio.load(html);
          results.live = {
            statusCode: resp.status,
            title: $("title").text().trim(),
            metaDescription: $('meta[name="description"]').attr("content") || null,
            metaRobots: $('meta[name="robots"]').attr("content") || null,
            canonical: $('link[rel="canonical"]').attr("href") || null,
            h1: $("h1").map((_, el) => $(el).text().trim()).get(),
            h2: $("h2").map((_, el) => $(el).text().trim()).get(),
            h3Count: $("h3").length,
            imgWithoutAlt: $("img:not([alt]), img[alt='']").length,
            totalImages: $("img").length,
            internalLinks: $(`a[href^='/'], a[href^='${targetUrl}']`).length,
            wordCount: $("body").text().replace(/\s+/g, " ").trim().split(" ").length,
            hasStructuredData: $('script[type="application/ld+json"]').length > 0,
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
    console.error(`[AMA] Tool ${name} failed:`, err.message);
    return JSON.stringify({ error: `Tool ${name} failed: ${err.message}` });
  }
}

// ─── System prompt ────────────────────────────────────────────────────────────

const AMA_SYSTEM_PROMPT_BASE = `You are the SmartEO AMA Assistant — an expert SEO analyst embedded inside the Smart Engine Optimizer platform built by Webserv (Sync Digital Solutions). AMA stands for Ask Me Anything.

You are a retrieval-grounded research agent. You do NOT guess, fabricate, or invent any data. Every factual claim in your response must come directly from a tool result.

AVAILABLE DATA SOURCES (via tools):
- Google Search Console (GSC): search queries, pages, clicks, impressions, CTR, position
- Google Analytics 4 (GA4): organic sessions, users, conversions, landing pages, funnels
- CallRail: call tracking, organic calls, qualified leads, landing page attribution
- CallTrackingMetrics (CTM): call tracking, form fills, source attribution
- SEMrush: organic keywords, traffic estimates, competitor visibility, ranking distribution
- Ahrefs: backlinks, referring domains, domain rating, keyword rankings
- Google Business Profile (GBP): reviews, local insights, calls, directions
- Screaming Frog: technical SEO crawl data, issues, CWV
- Airtable: work logs, deliverables, task tracking (last 365 days)
- Asana: open tasks, project status
- Google Sheets (NSM Tracker): North Star Metric goals, sessions/MVP targets, on-track status
- Notion (Strategy Bank): strategy recommendations, playbooks, service offerings

TOOL ROUTING — follow this exactly:
- Page traffic, clicks, impressions, CTR, search position → query_google_search_console
- Organic sessions, conversions, landing page performance, leads → query_google_analytics
- Phone calls, call volume, call-driving pages → query_callrail or query_ctm
- Keyword footprint, competitor rankings, share of voice → query_semrush or query_ahrefs
- Local search visibility, GBP reviews/calls/directions → query_gbp
- Technical issues, crawl errors, Core Web Vitals → query_screaming_frog
- Work completed, deliverables shipped → get_airtable_work_log
- Open tasks → get_asana_tasks
- Goals, targets, on-track status → get_nsm_goals
- Strategy notes, playbook recommendations → get_notion_strategy_bank
- Page HTML content, meta tags, heading structure, on-page copy → query_website
- NEVER use query_website to answer performance, traffic, ranking, or conversion questions.

MANDATORY GROUNDING RULES — never violate these:
1. ALWAYS call the appropriate tool(s) before answering any data question. Never guess or make up numbers.
2. If a tool returns an error, returns empty data, or says a source is not configured — report that fact explicitly.
3. If the retrieved data does not contain enough evidence to answer the question, say so clearly.
4. Never fill gaps with generic SEO knowledge or "best practice" filler.
5. Never invent metrics, rankings, dates, URLs, client details, or performance claims.
6. If two sources conflict, mention the conflict instead of silently choosing one.
7. Clearly label any data as coming from a specific source (e.g. "From GSC:", "From GA4 (last 90 days):").
8. If a source is disconnected, stale, or returns an error — say so and label the answer accordingly.
9. CRITICAL — Configuration errors are NOT zero-values: If a tool returns a configuration error, do NOT say the metric is zero or absent. Say you could NOT MEASURE it because the source was unavailable.

REQUIRED RESPONSE STRUCTURE when answering data questions:
### Answer
[Direct answer based only on retrieved data]

### Sources Used
[List which tools were called and what data was retrieved]

### What I Could Confirm
[Specific facts confirmed by the data]

### What I Could Not Confirm
[Anything the user asked about that the data did not cover]

For short factual lookups, condense this structure, but always cite which source the fact came from.

ADDITIONAL RULES:
- Present data clearly — use actual numbers, deltas, and percentages from the tool results.
- When comparing periods, explain whether metrics are up or down and by how much.
- If a data source isn't configured for a client, say so clearly rather than failing silently.
- You can and should call multiple tools to build a comprehensive answer.
- For quarter performance, use ga4_qtd_totals or ga4_qoq_organic_funnel.
- DATE RANGES: Use preset values for general queries. When the user specifies exact dates, use custom:YYYY-MM-DD:YYYY-MM-DD. NEVER invent non-standard date range strings.
- Do NOT output placeholder text like "let me fetch that" — just call the tool and report actual results.`;

export interface ClientContext {
  id: number;
  name: string;
}

function buildSystemPrompt(clientContext?: ClientContext, integrations?: string[]): string {
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  let prompt = AMA_SYSTEM_PROMPT_BASE;

  if (clientContext) {
    prompt += `

ACTIVE CLIENT CONTEXT:
The user has selected "${clientContext.name}" (ID: ${clientContext.id}) as the active client.
- ALL queries should be scoped to this client unless the user explicitly asks about a different client.
- When using any tool that requires a client_id, use ${clientContext.id}.
- When using get_nsm_goals, use client_id ${clientContext.id}.
- Do NOT ask the user which client they mean — they have already selected ${clientContext.name}.
- Do NOT call list_clients unless the user asks to switch clients or asks about all clients.`;
  } else {
    prompt += `

NO CLIENT SELECTED:
The user has not selected a specific client. If their question is about a specific client, call list_clients first to see what's available, then ask which client they mean.`;
  }

  if (integrations && integrations.length > 0) {
    prompt += `

SELECTED SOURCES (strict constraint):
The user has narrowed the query to these sources ONLY: ${integrations.join(", ")}.
- You MUST limit all data retrieval to these selected sources.
- Do NOT call tools for sources the user did not select, even if they would be helpful.
- If the answer cannot be fully answered from only these sources, state which part is missing and which source would have it.`;
  } else {
    prompt += `

NO SOURCE FILTER:
All available tools are accessible. Query whichever sources are most relevant to the question.`;
  }

  prompt += `

Today's date is ${today}.`;
  return prompt;
}

// ─── AMA message types ────────────────────────────────────────────────────────

export interface AmaMessage {
  role: "user" | "assistant";
  content: string;
}

export type StreamEvent =
  | { type: "tool_call"; name: string; input: Record<string, any> }
  | { type: "tool_result"; name: string; result: string }
  | { type: "token"; text: string }
  | { type: "done"; provider: string; toolCalls: ToolCallRecord[] }
  | { type: "error"; message: string };

// ─── Core provider loop (non-streaming, parallel tools) ───────────────────────

async function runWithProvider(
  provider: Provider,
  messages: AmaMessage[],
  clientContext?: ClientContext,
  integrations?: string[],
  onToolCall?: (record: ToolCallRecord) => void
): Promise<string> {
  const { client: oaiClient, model } = getProviderConfig(provider);
  const systemPrompt = buildSystemPrompt(clientContext, integrations);
  const filteredTools = getFilteredTools(integrations);

  type OAIMessage = OpenAI.Chat.ChatCompletionMessageParam;
  const apiMessages: OAIMessage[] = [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  for (let i = 0; i < 15; i++) {
    const completion = await oaiClient.chat.completions.create({
      model,
      messages: apiMessages,
      tools: filteredTools.length > 0 ? filteredTools : undefined,
      tool_choice: filteredTools.length > 0 ? "auto" : undefined,
      max_tokens: 4096,
    });

    const choice = completion.choices[0];
    if (!choice) throw new Error("No response from provider");

    const msg = choice.message;
    apiMessages.push(msg as OAIMessage);

    if (choice.finish_reason !== "tool_calls" || !msg.tool_calls || msg.tool_calls.length === 0) {
      return msg.content || "No response generated.";
    }

    // Execute all tool calls in parallel
    const toolResults = await Promise.all(
      msg.tool_calls.map(async (toolCall) => {
        const tc = toolCall as any;
        const toolName: string = tc.function.name;
        let toolInput: Record<string, any> = {};
        try { toolInput = JSON.parse(tc.function.arguments || "{}"); } catch { toolInput = {}; }
        console.log(`[AMA/${provider}] Tool: ${toolName}`, JSON.stringify(toolInput).slice(0, 200));
        const result = await executeTool(toolName, toolInput);
        const record: ToolCallRecord = { name: toolName, input: toolInput, result };
        if (onToolCall) onToolCall(record);
        return { id: toolCall.id, name: toolName, result };
      })
    );

    for (const { id, result } of toolResults) {
      apiMessages.push({ role: "tool", tool_call_id: id, content: result } as OAIMessage);
    }
  }

  return "I ran into an issue processing your request — too many data lookups were needed. Try asking a more specific question.";
}

// ─── Streaming provider loop ──────────────────────────────────────────────────

async function* streamWithProvider(
  provider: Provider,
  messages: AmaMessage[],
  clientContext?: ClientContext,
  integrations?: string[]
): AsyncGenerator<StreamEvent> {
  const { client: oaiClient, model } = getProviderConfig(provider);
  const systemPrompt = buildSystemPrompt(clientContext, integrations);
  const filteredTools = getFilteredTools(integrations);

  type OAIMessage = OpenAI.Chat.ChatCompletionMessageParam;
  const apiMessages: OAIMessage[] = [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  const allToolCalls: ToolCallRecord[] = [];

  for (let i = 0; i < 15; i++) {
    // Non-streaming call for tool-use turns
    const completion = await oaiClient.chat.completions.create({
      model,
      messages: apiMessages,
      tools: filteredTools.length > 0 ? filteredTools : undefined,
      tool_choice: filteredTools.length > 0 ? "auto" : undefined,
      max_tokens: 4096,
    });

    const choice = completion.choices[0];
    if (!choice) throw new Error("No response from provider");
    const msg = choice.message;
    apiMessages.push(msg as OAIMessage);

    if (choice.finish_reason !== "tool_calls" || !msg.tool_calls || msg.tool_calls.length === 0) {
      // This is the final response — stream it token by token
      const finalContent = msg.content || "";

      // Try to stream the final response
      try {
        const stream = await oaiClient.chat.completions.create({
          model,
          messages: apiMessages.slice(0, -1), // Remove the last assistant message so we re-generate as stream
          tools: undefined,
          max_tokens: 4096,
          stream: true,
        });
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content;
          if (text) yield { type: "token", text };
          if (chunk.choices[0]?.finish_reason === "stop") break;
        }
      } catch {
        // Streaming failed — yield the already-fetched content in one shot
        yield { type: "token", text: finalContent };
      }

      yield { type: "done", provider, toolCalls: allToolCalls };
      return;
    }

    // Yield tool_call events first (before parallel execution)
    const toolCallsThisRound: Array<{ id: string; name: string; input: Record<string, any> }> = [];
    for (const toolCall of msg.tool_calls) {
      const tc = toolCall as any;
      let toolInput: Record<string, any> = {};
      try { toolInput = JSON.parse(tc.function.arguments || "{}"); } catch { toolInput = {}; }
      toolCallsThisRound.push({ id: toolCall.id, name: tc.function.name, input: toolInput });
      yield { type: "tool_call", name: tc.function.name, input: toolInput };
    }

    // Execute all tools in parallel
    const toolResults = await Promise.all(
      toolCallsThisRound.map(async ({ id, name, input }) => {
        const result = await executeTool(name, input);
        return { id, name, input, result };
      })
    );

    // Yield tool results and build message history
    for (const { id, name, input, result } of toolResults) {
      const record: ToolCallRecord = { name, input, result };
      allToolCalls.push(record);
      yield { type: "tool_result", name, result: result.slice(0, 800) };
      apiMessages.push({ role: "tool", tool_call_id: id, content: result } as OAIMessage);
    }
  }

  yield { type: "error", message: "Too many data lookups — try asking a more specific question." };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function runAmaChat(
  messages: AmaMessage[],
  clientContext?: ClientContext,
  integrations?: string[],
  onToolCall?: (record: ToolCallRecord) => void
): Promise<{ response: string; provider: string; toolCalls: ToolCallRecord[] }> {
  const chain = getProviderChain();
  if (chain.length === 0) {
    throw new Error("No AI providers configured. Add at least one API key in Secrets: GROQ_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY, or PERPLEXITY_API_KEY.");
  }

  const toolCalls: ToolCallRecord[] = [];

  for (const provider of chain) {
    try {
      console.log(`[AMA] Trying provider: ${provider}`);
      setAiActive(provider as any, true);
      try {
        const response = await runWithProvider(
          provider, messages, clientContext, integrations,
          (record) => { toolCalls.push(record); if (onToolCall) onToolCall(record); }
        );
        return { response, provider, toolCalls };
      } finally {
        setAiActive(provider as any, false);
      }
    } catch (err: any) {
      console.error(`[AMA] ${provider} failed:`, err?.status, err?.message?.slice(0, 200));
    }
  }

  throw new Error("All AI providers failed. Check provider API keys in Secrets.");
}

export async function* streamAmaChat(
  messages: AmaMessage[],
  clientContext?: ClientContext,
  integrations?: string[]
): AsyncGenerator<StreamEvent> {
  const chain = getProviderChain();
  if (chain.length === 0) {
    yield { type: "error", message: "No AI providers configured. Add at least one API key in Secrets." };
    return;
  }

  for (const provider of chain) {
    try {
      console.log(`[AMA] Streaming with provider: ${provider}`);
      setAiActive(provider as any, true);
      try {
        yield* streamWithProvider(provider, messages, clientContext, integrations);
        return;
      } finally {
        setAiActive(provider as any, false);
      }
    } catch (err: any) {
      console.error(`[AMA] ${provider} streaming failed:`, err?.status, err?.message?.slice(0, 200));
    }
  }

  yield { type: "error", message: "All AI providers failed. Check API keys in Secrets." };
}

// ─── Legacy alias (for any existing imports) ─────────────────────────────────
export const runAcaChat = async (
  messages: AmaMessage[],
  clientContext?: ClientContext,
  integrations?: string[],
  onToolCall?: (name: string, input: Record<string, any>) => void
) => {
  const result = await runAmaChat(messages, clientContext, integrations,
    onToolCall ? (r) => onToolCall(r.name, r.input) : undefined
  );
  return result;
};
