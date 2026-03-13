/**
 * adminAuth.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Client-side admin authentication helpers.
 *
 * The admin token is obtained by calling POST /api/auth/admin-verify with the
 * admin code. On success the server confirms the code is valid; we then store
 * the raw code in sessionStorage so it can be sent as X-Admin-Token on every
 * admin write request. The token clears when the browser session ends.
 *
 * This is NOT a security-through-obscurity trick — the server independently
 * validates X-Admin-Token === process.env.ADMIN_TOKEN on every protected request.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const ADMIN_TOKEN_KEY = "smarteo_admin_token";

/** Retrieve the stored admin token (from sessionStorage). null if not unlocked. */
export function getAdminToken(): string | null {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Store the admin token after a successful verify. */
export function setAdminToken(token: string): void {
  try {
    sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
  } catch {}
}

/** Clear the admin token (sign out of admin session). */
export function clearAdminToken(): void {
  try {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {}
}

/** Returns true if an admin token is currently stored in sessionStorage. */
export function isAdminUnlocked(): boolean {
  return Boolean(getAdminToken());
}

/**
 * Verify an admin code with the server.
 * Calls POST /api/auth/admin-verify — a public endpoint that validates the code
 * server-side and returns { ok: true } if valid.
 *
 * On success, stores the token and returns true.
 * On failure (wrong code / server error), returns false.
 */
export async function verifyAndStoreAdminToken(code: string): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/admin-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: code.trim() }),
      credentials: "include",
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.ok) {
      setAdminToken(code.trim());
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
