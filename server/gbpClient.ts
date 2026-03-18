import type { Client, Command, CommandResult } from "@shared/schema";
import { tryWithGoogleTokens } from "./googleToken";

async function gbpGet(accessToken: string, url: string): Promise<any> {
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await resp.json() as any;
  if (!resp.ok) throw new Error(data.error?.message || `GBP API error ${resp.status}`);
  return data;
}

export async function queryGbp(
  command: Command,
  client: Client,
  dateRange: string
): Promise<CommandResult | null> {
  if (command !== "gbp_local_summary") return null;
  const gbpLocationName = (client as any).gbpLocationName as string | undefined;
  if (!gbpLocationName) return null;

  try {
    return await tryWithGoogleTokens("google_business_profile", async (accessToken) => {
    const [reviewsData, insightsData] = await Promise.all([
      gbpGet(accessToken, `https://mybusiness.googleapis.com/v4/${gbpLocationName}/reviews?pageSize=5`),
      gbpGet(accessToken, `https://businessprofileperformance.googleapis.com/v1/${gbpLocationName}:fetchMultiDailyMetricsTimeSeries?dailyMetrics=CALL_CLICKS&dailyMetrics=WEBSITE_CLICKS&dailyMetrics=DIRECTION_REQUESTS&dailyRange.startDate.year=2024&dailyRange.startDate.month=1&dailyRange.startDate.day=1&dailyRange.endDate.year=2024&dailyRange.endDate.month=3&dailyRange.endDate.day=31`).catch(() => null),
    ]);

    const reviews = reviewsData.reviews ?? [];
    const avgRating = reviews.length > 0
      ? (reviews.reduce((s: number, r: any) => s + (r.starRating === "FIVE" ? 5 : r.starRating === "FOUR" ? 4 : r.starRating === "THREE" ? 3 : r.starRating === "TWO" ? 2 : 1), 0) / reviews.length)
      : 0;
    const totalReviews = reviewsData.totalReviewCount ?? reviews.length;

    const recentReviewRows = reviews.slice(0, 5).map((r: any) => [
      r.reviewer?.displayName ?? "Anonymous",
      r.starRating ?? "—",
      (r.comment ?? "").substring(0, 80) + ((r.comment?.length ?? 0) > 80 ? "…" : ""),
      r.createTime ? new Date(r.createTime).toLocaleDateString("en-US") : "—",
    ]);

    return {
      command,
      clientName: client.name,
      dateRange,
      summary: [
        { label: "Total Reviews", current: totalReviews.toString(), previous: "—", delta: "—", deltaPercent: "—", isPositive: true },
        { label: "Avg Star Rating", current: avgRating > 0 ? avgRating.toFixed(1) : "—", previous: "—", delta: "—", deltaPercent: "—", isPositive: avgRating >= 4 },
      ],
      tables: recentReviewRows.length ? [{ title: "Recent Reviews", headers: ["Reviewer", "Stars", "Comment", "Date"], rows: recentReviewRows }] : [],
    };
    });
  } catch (err: any) {
    console.error(`[GBP] ${command} error:`, err.message);
    throw err;
  }
}
