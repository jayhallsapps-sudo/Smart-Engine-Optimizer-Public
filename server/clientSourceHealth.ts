import { storage } from "./storage";
import {
  testGSC,
  testGA4,
  testCallRail,
  testCTM,
  testAirtable,
  testAsana,
  testSEMrush,
} from "./connectionTest";
import { decrypt } from "./encryption";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { resolveViewId } from "./airtable";
import type { Client } from "@shared/schema";

export type HealthStatus = "ok" | "partial" | "broken" | "not_configured";

export interface SourceHealth {
  status: HealthStatus;
  message: string;
}

export interface ClientSourceHealthResponse {
  gsc: SourceHealth;
  ga4: SourceHealth;
  callrail: SourceHealth;
  ctm: SourceHealth;
  nimbata: SourceHealth;
  airtable: SourceHealth;
  asana: SourceHealth;
  semrush: SourceHealth;
  ahrefs: SourceHealth;
  checkedAt: string;
}

async function getCredentialValue(service: string): Promise<string | null> {
  const all = await storage.getApiCredentials();
  const cred = all.find((c) => c.service === service);
  if (!cred) return null;
  try {
    return decrypt(cred.encryptedValue);
  } catch {
    return null;
  }
}

async function checkGsc(client: Client): Promise<SourceHealth> {
  if (!client.gscSiteUrl) {
    return { status: "not_configured", message: "Site URL not set" };
  }
  const token = await getCredentialValue("google_search_console");
  if (!token) return { status: "broken", message: "GSC platform credential missing or undecryptable" };
  const result = await testGSC(token);
  if (!result.success) return { status: "broken", message: result.message };
  return { status: "ok", message: "Connected" };
}

async function checkGa4(client: Client): Promise<SourceHealth> {
  if (!client.ga4PropertyId) {
    return { status: "not_configured", message: "Property ID not set" };
  }
  const token = await getCredentialValue("google_analytics_4");
  if (!token) return { status: "broken", message: "GA4 platform credential missing or undecryptable" };
  const result = await testGA4(token);
  if (!result.success) return { status: "broken", message: result.message };
  return { status: "ok", message: "Connected" };
}

async function checkCallRail(client: Client): Promise<SourceHealth> {
  if (!client.callrailCompanyId && !client.callrailAccountId) {
    return { status: "not_configured", message: "CallRail not configured" };
  }
  const token = await getCredentialValue("callrail");
  if (!token) return { status: "broken", message: "CallRail credential missing or undecryptable" };
  const result = await testCallRail(token);
  if (!result.success) return { status: "broken", message: result.message };
  return { status: "ok", message: "Connected" };
}

async function checkCtm(client: Client): Promise<SourceHealth> {
  if (!client.ctmAccountId) {
    return { status: "not_configured", message: "CTM not configured" };
  }
  // CTM uses a paired credential — we cannot easily test without both keys, so we just verify the credential exists
  const all = await storage.getApiCredentials();
  const ctmCreds = all.filter((c) => c.service === "call_tracking_metrics");
  if (ctmCreds.length === 0) return { status: "broken", message: "CTM credentials missing" };
  return { status: "ok", message: "Configured" };
}

async function checkNimbata(client: Client): Promise<SourceHealth> {
  if (!client.nimbataAccountId) {
    return { status: "not_configured", message: "Nimbata not configured" };
  }
  // No test endpoint defined; surface as partial
  return { status: "partial", message: "Configured (no live health check available)" };
}

async function checkAirtable(client: Client): Promise<SourceHealth> {
  if (!client.airtableBaseId) {
    return { status: "not_configured", message: "Airtable not configured" };
  }
  const pat = process.env.AIRTABLE_PAT;
  if (!pat) return { status: "broken", message: "AIRTABLE_PAT not set on server" };
  // If table/views are set, validate them; otherwise just check platform credential
  if (!client.airtableTableName || !client.airtableProductionView || !client.airtableEverythingView) {
    return { status: "partial", message: "Base ID set but table/views incomplete" };
  }
  try {
    const prodId = await resolveViewId(client.airtableBaseId, client.airtableTableName, client.airtableProductionView, pat);
    const everyId = await resolveViewId(client.airtableBaseId, client.airtableTableName, client.airtableEverythingView, pat);
    if (prodId === null || everyId === null) {
      return { status: "broken", message: "One or more view names do not exist in this base" };
    }
    return { status: "ok", message: "Connected" };
  } catch (err: any) {
    return { status: "broken", message: err?.message ?? "Airtable validation failed" };
  }
}

async function checkAsana(client: Client): Promise<SourceHealth> {
  if (!client.asanaProjectId) {
    return { status: "not_configured", message: "Asana project not configured" };
  }
  try {
    const connectors = new ReplitConnectors();
    const resp = await connectors.proxy("asana", `/api/1.0/projects/${client.asanaProjectId}`, { method: "GET" });
    if (!resp.ok) return { status: "broken", message: `Asana returned ${resp.status} — check project access` };
    return { status: "ok", message: "Connected" };
  } catch (err: any) {
    return { status: "broken", message: err?.message ?? "Asana validation failed" };
  }
}

async function checkSemrush(client: Client): Promise<SourceHealth> {
  if (!client.semrushProjectId) {
    return { status: "not_configured", message: "SEMrush not configured" };
  }
  const token = await getCredentialValue("semrush");
  if (!token) return { status: "broken", message: "SEMrush credential missing or undecryptable" };
  const result = await testSEMrush(token);
  if (!result.success) return { status: "broken", message: result.message };
  return { status: "ok", message: "Connected" };
}

async function checkAhrefs(client: Client): Promise<SourceHealth> {
  if (!client.ahrefsProjectUrl) {
    return { status: "not_configured", message: "Ahrefs not configured" };
  }
  // Ahrefs is CSV-only in current setup — partial by definition
  return { status: "partial", message: "Configured — CSV upload mode (no live API)" };
}

export async function getClientSourceHealth(client: Client): Promise<ClientSourceHealthResponse> {
  const [gsc, ga4, callrail, ctm, nimbata, airtable, asana, semrush, ahrefs] = await Promise.all([
    checkGsc(client),
    checkGa4(client),
    checkCallRail(client),
    checkCtm(client),
    checkNimbata(client),
    checkAirtable(client),
    checkAsana(client),
    checkSemrush(client),
    checkAhrefs(client),
  ]);
  return {
    gsc, ga4, callrail, ctm, nimbata, airtable, asana, semrush, ahrefs,
    checkedAt: new Date().toISOString(),
  };
}
