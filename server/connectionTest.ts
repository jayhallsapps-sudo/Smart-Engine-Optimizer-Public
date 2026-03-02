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

export async function testCredential(credentialId: number): Promise<TestResult> {
  const all = await storage.getApiCredentials();
  const cred = all.find((c) => c.id === credentialId);
  if (!cred) return { success: false, message: "Credential not found" };

  try {
    const value = decrypt(cred.encryptedValue);

    if (cred.service === "google_search_console") {
      return testGSC(value);
    }

    if (cred.service === "google_analytics_4") {
      return testGA4(value);
    }

    if (cred.service === "callrail") {
      return testCallRail(value);
    }

    if (cred.service === "call_tracking_metrics") {
      const pair = all.find(
        (c) =>
          c.service === "call_tracking_metrics" &&
          c.accountLabel === cred.accountLabel &&
          c.id !== cred.id
      );
      if (!pair) return { success: false, message: "Missing paired API key or secret for this account" };
      const pairValue = decrypt(pair.encryptedValue);
      const [key, secret] =
        cred.credentialType === "api_key" ? [value, pairValue] : [pairValue, value];
      return testCTM(key, secret);
    }

    return { success: false, message: `No test available for ${cred.service}` };
  } catch (err: any) {
    return { success: false, message: `Decryption error: ${err.message}` };
  }
}
