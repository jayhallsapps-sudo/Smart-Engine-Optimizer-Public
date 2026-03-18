import { storage } from "./storage";
import { decrypt } from "./encryption";

async function refreshToAccessToken(refreshToken: string): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const data = await resp.json() as any;
  return data.access_token ?? null;
}

export async function getGoogleAccessToken(service: string): Promise<string | null> {
  const creds = await storage.getApiCredentialsByService(service);
  if (!creds.length) return null;

  let refreshToken: string;
  try {
    refreshToken = decrypt(creds[0].encryptedValue);
  } catch (err) {
    console.warn(`[googleToken] Failed to decrypt ${service} credential — re-authorization required in Setup:`, (err as Error).message);
    return null;
  }

  return refreshToAccessToken(refreshToken);
}

export async function getAllGoogleAccessTokens(service: string): Promise<string[]> {
  const creds = await storage.getApiCredentialsByService(service);
  if (!creds.length) return [];

  const tokens: string[] = [];
  for (const cred of creds) {
    let refreshToken: string;
    try {
      refreshToken = decrypt(cred.encryptedValue);
    } catch {
      continue;
    }
    const token = await refreshToAccessToken(refreshToken);
    if (token) tokens.push(token);
  }
  return tokens;
}

/**
 * Try an API call with every stored credential for a Google service, returning
 * the first successful result. Skips credentials that result in permission
 * errors or decryption failures and moves on to the next. Throws the last
 * error if every credential fails.
 */
export async function tryWithGoogleTokens<T>(
  service: string,
  fn: (accessToken: string) => Promise<T>
): Promise<T> {
  const creds = await storage.getApiCredentialsByService(service);
  if (!creds.length) throw new Error(`No credentials stored for ${service}`);

  let lastError: Error = new Error(`No valid credentials for ${service}`);

  for (const cred of creds) {
    let refreshToken: string;
    try {
      refreshToken = decrypt(cred.encryptedValue);
    } catch (err) {
      console.warn(`[googleToken] Skipping ${service} credential id=${cred.id} — decrypt failed`);
      continue;
    }

    const accessToken = await refreshToAccessToken(refreshToken);
    if (!accessToken) {
      console.warn(`[googleToken] Skipping ${service} credential id=${cred.id} — token refresh failed`);
      continue;
    }

    try {
      return await fn(accessToken);
    } catch (err: any) {
      lastError = err;
      const msg = (err.message || "").toLowerCase();
      const isPermission = msg.includes("permission") || msg.includes("forbidden") || msg.includes("403") || msg.includes("not authorized") || msg.includes("insufficient");
      if (isPermission) {
        console.warn(`[googleToken] ${service} credential id=${cred.id} lacks permission — trying next account`);
        continue;
      }
      // Non-permission errors (network, bad request, etc.) — throw immediately
      throw err;
    }
  }

  throw lastError;
}

export function extractDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function dateRangeToGoogleDates(dateRange: string): {
  startDate: string;
  endDate: string;
  prevStartDate: string;
  prevEndDate: string;
} {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  const sub = (d: Date, days: number) => {
    const r = new Date(d);
    r.setDate(r.getDate() - days);
    return r;
  };

  const endDate = fmt(now);

  if (dateRange.startsWith("custom:")) {
    const parts = dateRange.split(":");
    const startDate = parts[1] ?? fmt(sub(now, 14));
    const customEnd = parts[2] ?? endDate;
    const days = Math.round((new Date(customEnd).getTime() - new Date(startDate).getTime()) / 86400000);
    const prevEndDate = fmt(sub(new Date(startDate), 1));
    const prevStartDate = fmt(sub(new Date(startDate), days));
    return { startDate, endDate: customEnd, prevStartDate, prevEndDate };
  }

  if (dateRange === "last_14_vs_prev_14") {
    const startDate = fmt(sub(now, 14));
    const prevEndDate = fmt(sub(now, 15));
    const prevStartDate = fmt(sub(now, 28));
    return { startDate, endDate, prevStartDate, prevEndDate };
  }
  if (dateRange === "last_30_vs_prev_30") {
    const startDate = fmt(sub(now, 30));
    const prevEndDate = fmt(sub(now, 31));
    const prevStartDate = fmt(sub(now, 60));
    return { startDate, endDate, prevStartDate, prevEndDate };
  }
  if (dateRange === "last_365_vs_prev_365") {
    const startDate = fmt(sub(now, 365));
    const prevEndDate = fmt(sub(now, 366));
    const prevStartDate = fmt(sub(now, 730));
    return { startDate, endDate, prevStartDate, prevEndDate };
  }
  if (dateRange === "qtd") {
    const month = now.getMonth();
    const qStartMonth = Math.floor(month / 3) * 3;
    const qStart = new Date(now.getFullYear(), qStartMonth, 1);
    const prevQStart = new Date(now.getFullYear(), qStartMonth - 3, 1);
    const prevQEnd = new Date(now.getFullYear(), qStartMonth, 0);
    return { startDate: fmt(qStart), endDate, prevStartDate: fmt(prevQStart), prevEndDate: fmt(prevQEnd) };
  }
  // calendar_month:YYYY-MM — exact calendar month vs prior calendar month
  if (dateRange.startsWith("calendar_month:")) {
    const ym = dateRange.replace("calendar_month:", "");
    const [y, m] = ym.split("-").map(Number);
    return {
      startDate: fmt(new Date(y, m - 1, 1)),
      endDate: fmt(new Date(y, m, 0)),
      prevStartDate: fmt(new Date(y, m - 2, 1)),
      prevEndDate: fmt(new Date(y, m - 1, 0)),
    };
  }

  // calendar_qtd:YYYY-MM — quarter-to-date through end of selected month vs same-length prior window
  if (dateRange.startsWith("calendar_qtd:")) {
    const ym = dateRange.replace("calendar_qtd:", "");
    const [y, m] = ym.split("-").map(Number);
    const qStartMonth = Math.floor((m - 1) / 3) * 3;
    const qtdStart = new Date(y, qStartMonth, 1);
    const qtdEnd = new Date(y, m, 0);
    const qtdDays = Math.round((qtdEnd.getTime() - qtdStart.getTime()) / 86400000);
    const prevQtdEnd = new Date(qtdStart.getTime() - 86400000);
    const prevQtdStart = new Date(prevQtdEnd.getTime() - qtdDays * 86400000);
    return {
      startDate: fmt(qtdStart),
      endDate: fmt(qtdEnd),
      prevStartDate: fmt(prevQtdStart),
      prevEndDate: fmt(prevQtdEnd),
    };
  }

  // calendar_quarter:Q-YYYY — full calendar quarter vs prior calendar quarter
  // e.g. "calendar_quarter:1-2026" → Q1 2026 (Jan–Mar) vs Q4 2025 (Oct–Dec)
  if (dateRange.startsWith("calendar_quarter:")) {
    const parts = dateRange.replace("calendar_quarter:", "").split("-");
    const q = Number(parts[0]);
    const y = Number(parts[1]);
    const qStartMonth = (q - 1) * 3; // 0-indexed: Q1→0, Q2→3, Q3→6, Q4→9
    const qStart = new Date(y, qStartMonth, 1);
    const qEnd = new Date(y, qStartMonth + 3, 0);
    const prevQStartMonthRaw = qStartMonth - 3;
    const prevQYear = prevQStartMonthRaw < 0 ? y - 1 : y;
    const prevQStartMonth = prevQStartMonthRaw < 0 ? prevQStartMonthRaw + 12 : prevQStartMonthRaw;
    const prevQStart = new Date(prevQYear, prevQStartMonth, 1);
    const prevQEnd = new Date(qStart.getTime() - 86400000);
    return { startDate: fmt(qStart), endDate: fmt(qEnd), prevStartDate: fmt(prevQStart), prevEndDate: fmt(prevQEnd) };
  }

  // default: last_90_vs_prev_90
  const startDate = fmt(sub(now, 90));
  const prevEndDate = fmt(sub(now, 91));
  const prevStartDate = fmt(sub(now, 180));
  return { startDate, endDate, prevStartDate, prevEndDate };
}

export function pctDelta(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? "+∞%" : "—";
  const pct = ((current - previous) / previous) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

export function fmtDelta(current: number, previous: number): string {
  const d = current - previous;
  return `${d >= 0 ? "+" : ""}${d.toLocaleString()}`;
}
