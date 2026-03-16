import { ReplitConnectors } from "@replit/connectors-sdk";
import { decrypt } from "./encryption";
import { storage } from "./storage";

export interface TestResult {
  success: boolean;
  message: string;
}

async function getGoogleAccessToken(refreshToken: string): Promise<string> {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = (await resp.json()) as any;
  if (!data.access_token) {
    throw new Error(data.error_description || data.error || "Failed to refresh Google token");
  }
  return data.access_token;
}

async function testGSC(refreshToken: string): Promise<TestResult> {
  try {
    const token = await getGoogleAccessToken(refreshToken);
    const resp = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await resp.json()) as any;
    if (!resp.ok) throw new Error(data.error?.message || resp.statusText);
    const n = data.siteEntry?.length ?? 0;
    return { success: true, message: `${n} site${n !== 1 ? "s" : ""} accessible` };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

async function testGA4(refreshToken: string): Promise<TestResult> {
  try {
    const token = await getGoogleAccessToken(refreshToken);
    const resp = await fetch("https://analyticsadmin.googleapis.com/v1beta/accountSummaries", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await resp.json()) as any;
    if (!resp.ok) throw new Error(data.error?.message || resp.statusText);
    const props = (data.accountSummaries ?? []).reduce(
      (sum: number, a: any) => sum + (a.propertySummaries?.length ?? 0),
      0
    );
    return { success: true, message: `${props} propert${props !== 1 ? "ies" : "y"} accessible` };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

async function testGBP(refreshToken: string): Promise<TestResult> {
  try {
    const token = await getGoogleAccessToken(refreshToken);
    const resp = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await resp.json()) as any;
    if (!resp.ok) {
      const msg: string = data.error?.message ?? resp.statusText;
      if (msg.toLowerCase().includes("quota") || resp.status === 429) {
        return { success: false, message: "GBP API quota is 0 — quota increase has been requested. Enter location resource names manually until approved." };
      }
      if (msg.includes("has not been used") || msg.includes("is disabled")) {
        return { success: false, message: "Google My Business Account Management API is not enabled in Google Cloud Console." };
      }
      throw new Error(msg);
    }
    const n = data.accounts?.length ?? 0;
    return { success: true, message: `Token valid — ${n} GBP account${n !== 1 ? "s" : ""} accessible` };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

async function testGoogleSheets(refreshToken: string): Promise<TestResult> {
  try {
    const token = await getGoogleAccessToken(refreshToken);
    const resp = await fetch(
      "https://www.googleapis.com/drive/v3/files?q=mimeType%3D'application%2Fvnd.google-apps.spreadsheet'&pageSize=1&fields=files(id)",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = (await resp.json()) as any;
    if (!resp.ok) throw new Error(data.error?.message || resp.statusText);
    return { success: true, message: "Google Sheets access confirmed" };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

async function testCallRail(apiKey: string): Promise<TestResult> {
  try {
    const resp = await fetch("https://api.callrail.com/v3/a.json", {
      headers: { Authorization: `Token token="${apiKey}"` },
    });
    const data = (await resp.json()) as any;
    if (!resp.ok) throw new Error(data.error || resp.statusText);
    const n = data.accounts?.length ?? 0;
    return { success: true, message: `${n} account${n !== 1 ? "s" : ""} accessible` };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

async function testAhrefs(apiKey: string): Promise<TestResult> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const resp = await fetch(
      `https://api.ahrefs.com/v3/site-explorer/domain-rating?target=ahrefs.com&date=${today}`,
      { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } }
    );
    if (resp.status === 401 || resp.status === 403) throw new Error("Invalid API key — check the token in your Ahrefs account settings");
    if (resp.status === 429) throw new Error("Rate limit exceeded — try again shortly");
    if (!resp.ok) {
      const body = await resp.text();
      // Ahrefs returns ["Error","..."] arrays for some errors
      try { const arr = JSON.parse(body); if (Array.isArray(arr)) throw new Error(arr[1] ?? arr[0]); } catch {}
      throw new Error(body.substring(0, 120) || resp.statusText);
    }
    const data = await resp.json() as any;
    const dr = data?.domain?.domain_rating ?? data?.domain_rating ?? data?.domainRating;
    return {
      success: true,
      message: dr != null ? `API key valid — ahrefs.com DR ${Math.round(dr)}` : "API key valid",
    };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

async function testSEMrush(apiKey: string): Promise<TestResult> {
  try {
    const resp = await fetch(
      `https://api.semrush.com/?type=phrase_this&key=${apiKey}&phrase=seo&database=us&export_columns=Ph,Nq`
    );
    const text = await resp.text();
    if (resp.status === 403 || resp.status === 401 || text.startsWith("ERROR 50")) {
      throw new Error("Invalid API key");
    }
    if (text.startsWith("ERROR")) {
      throw new Error(text.trim());
    }
    if (!resp.ok) {
      throw new Error(text || resp.statusText);
    }
    return { success: true, message: "API key valid" };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

async function testCTM(apiKey: string, apiSecret: string): Promise<TestResult> {
  try {
    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
    const resp = await fetch("https://api.calltrackingmetrics.com/api/v1/accounts", {
      headers: { Authorization: `Basic ${auth}` },
    });
    const data = (await resp.json()) as any;
    if (!resp.ok) throw new Error(data.error || resp.statusText);
    const n = data.accounts?.length ?? 0;
    return { success: true, message: `${n} account${n !== 1 ? "s" : ""} accessible` };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

async function testAirtable(pat: string): Promise<TestResult> {
  try {
    const resp = await fetch("https://api.airtable.com/v0/meta/whoami", {
      headers: { Authorization: `Bearer ${pat}` },
    });
    const data = (await resp.json()) as any;
    if (!resp.ok) {
      throw new Error(data?.error?.message || data?.message || resp.statusText);
    }
    const email = data?.email ?? data?.id ?? "connected";
    return { success: true, message: `Authenticated as ${email}` };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

async function testAsana(): Promise<TestResult> {
  try {
    const connectors = new ReplitConnectors();
    const resp = await connectors.proxy("asana", "/api/1.0/users/me", { method: "GET" });
    const data = await resp.json() as any;
    if (data.errors?.length) throw new Error(data.errors[0]?.message ?? "Asana error");
    if (!data.data) throw new Error("No response from Asana");
    const name: string = data.data.name ?? "connected";
    return { success: true, message: `Connected as ${name}` };
  } catch (err: any) {
    return { success: false, message: `Asana connection failed — check Replit integration is authorised: ${err.message}` };
  }
}

export async function testCredential(credentialId: number): Promise<TestResult> {
  const all = await storage.getApiCredentials();
  const cred = all.find((c) => c.id === credentialId);
  if (!cred) return { success: false, message: "Credential not found" };

  let value: string;
  try {
    value = decrypt(cred.encryptedValue);
  } catch (err: any) {
    const isAuthError =
      err.message?.includes("Unsupported state") ||
      err.message?.includes("unable to authenticate data") ||
      err.message?.includes("bad decrypt");
    const label = cred.service.replace(/_/g, " ");
    return {
      success: false,
      message: isAuthError
        ? `Credential cannot be decrypted — it was saved with a different encryption key. Please delete it and re-enter your ${label} credentials in Setup.`
        : `Decryption error: ${err.message}`,
    };
  }

  try {
    if (cred.service === "google_search_console") return testGSC(value);
    if (cred.service === "google_analytics_4") return testGA4(value);
    if (cred.service === "google_business_profile") return testGBP(value);
    if (cred.service === "google_sheets") return testGoogleSheets(value);
    if (cred.service === "callrail") return testCallRail(value);
    if (cred.service === "ahrefs") return testAhrefs(value);
    if (cred.service === "semrush") return testSEMrush(value);
    if (cred.service === "airtable") return testAirtable(value);

    if (cred.service === "call_tracking_metrics") {
      const pair = all.find(
        (c) =>
          c.service === "call_tracking_metrics" &&
          c.accountLabel === cred.accountLabel &&
          c.id !== cred.id
      );
      if (!pair) return { success: false, message: "Missing paired API key or secret for this account" };
      let pairValue: string;
      try {
        pairValue = decrypt(pair.encryptedValue);
      } catch {
        return { success: false, message: "Paired CTM credential cannot be decrypted — please re-enter both the API key and secret in Setup." };
      }
      const [key, secret] =
        cred.credentialType === "api_key" ? [value, pairValue] : [pairValue, value];
      return testCTM(key, secret);
    }

    if (cred.service === "asana") return testAsana();

    if (cred.service === "nimbata") {
      return { success: false, message: "Nimbata does not provide an API test endpoint. Verify the account ID is correct in each client's settings." };
    }

    return { success: false, message: `No connectivity test available for ${cred.service.replace(/_/g, " ")}` };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}
