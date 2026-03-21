/**
 * Canonical monthly content credit capacities per client.
 * Source of truth per data-handling-rules skill.
 * Values: Anchored Tides=4, Bliss=8, Sol Women's=5,
 *         Williamsburg=3, Horseshoe Ridge=4, Iris Healing=5
 *
 * Matching is case-insensitive substring on the client name.
 * Unknown clients fall back to DEFAULT_MONTHLY_CREDITS.
 */
export const CLIENT_MONTHLY_CREDIT_MAP: Record<string, number> = {
  "anchored tides": 4,
  "bliss recovery": 8,
  "sol women": 5,
  "williamsburg house": 3,
  "horseshoe ridge": 4,
  "iris healing": 5,
};

export const DEFAULT_MONTHLY_CREDITS = 5;

/**
 * Resolve the monthly content credit capacity for a given client name.
 * Returns DEFAULT_MONTHLY_CREDITS when the client is not in the map.
 */
export function resolveClientMonthlyCredits(clientName: string): number {
  const lower = clientName.toLowerCase();
  return (
    Object.entries(CLIENT_MONTHLY_CREDIT_MAP).find(([key]) => lower.includes(key))?.[1] ??
    DEFAULT_MONTHLY_CREDITS
  );
}
