import { randomUUID } from "crypto";
import { storage } from "./storage";
import { encrypt } from "./encryption";

const GOOGLE_SCOPES: Record<string, string> = {
  google_search_console: "https://www.googleapis.com/auth/webmasters.readonly",
  google_analytics_4: "https://www.googleapis.com/auth/analytics.readonly",
  google_sheets: "https://www.googleapis.com/auth/spreadsheets.readonly",
  google_business_profile: "https://www.googleapis.com/auth/business.manage",
};

interface OAuthState {
  service: string;
  accountLabel: string;
  expires: number;
}

const pendingStates = new Map<string, OAuthState>();

function getRedirectUri(): string {
  const domains = process.env.REPLIT_DOMAINS;
  if (domains) {
    return `https://${domains.split(",")[0]}/api/auth/google/callback`;
  }
  return "http://localhost:5000/api/auth/google/callback";
}

export function isGoogleConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function buildGoogleAuthUrl(service: string, accountLabel: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID is not configured");

  const scope = GOOGLE_SCOPES[service];
  if (!scope) throw new Error(`Unknown service: ${service}`);

  const state = randomUUID();
  pendingStates.set(state, { service, accountLabel, expires: Date.now() + 10 * 60 * 1000 });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope,
    access_type: "offline",
    prompt: "select_account consent",
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCodeForToken(
  code: string,
  state: string
): Promise<{ service: string; accountLabel: string }> {
  const stateData = pendingStates.get(state);
  if (!stateData || stateData.expires < Date.now()) {
    throw new Error("Invalid or expired OAuth state. Please try connecting again.");
  }
  pendingStates.delete(state);

  const { service, accountLabel } = stateData;
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getRedirectUri(),
      grant_type: "authorization_code",
    }),
  });

  const data = (await response.json()) as any;

  if (data.error) {
    throw new Error(data.error_description || data.error);
  }
  if (!data.refresh_token) {
    throw new Error("Google did not return a refresh token. Try revoking access in your Google account and reconnecting.");
  }

  await storage.createApiCredential({
    service,
    credentialType: "refresh_token",
    accountLabel,
    encryptedValue: encrypt(data.refresh_token),
    metadata: { scope: GOOGLE_SCOPES[service] },
  });

  return { service, accountLabel };
}

export function callbackHtml(success: boolean, message: string): string {
  const payload = JSON.stringify({ type: "google_oauth_result", success, message });
  return `<!DOCTYPE html>
<html>
<head>
  <title>${success ? "Connected" : "Error"}</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f9fafb; }
    .box { text-align: center; padding: 2rem; border-radius: 12px; background: white; box-shadow: 0 1px 8px rgba(0,0,0,.1); max-width: 360px; }
    .icon { font-size: 2.5rem; margin-bottom: 0.75rem; }
    p { color: #6b7280; font-size: 0.875rem; }
  </style>
</head>
<body>
  <div class="box">
    <div class="icon">${success ? "✅" : "❌"}</div>
    <p>${success ? "Connected successfully. This window will close." : `Error: ${message}`}</p>
  </div>
  <script>
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(${payload}, '*');
      }
    } catch(e) {}
    setTimeout(() => window.close(), 1500);
  </script>
</body>
</html>`;
}
