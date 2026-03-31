/**
 * server/auth.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Core authentication utilities for SmartEO.
 * - Password hashing via bcryptjs
 * - Session-based auth helpers
 * - requireAuth / requireAdminRole middleware
 * ─────────────────────────────────────────────────────────────────────────────
 */

import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { db } from "./db";
import {
  users,
  userSessions,
  userPermissions,
  userReportPermissions,
  type User,
  type SafeUser,
  type ModuleKey,
  type ReportSubKey,
} from "@shared/schema";
import { eq, and, isNull, gt } from "drizzle-orm";

const BCRYPT_ROUNDS = 12;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─── Password helpers ──────────────────────────────────────────────────────────

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let pwd = "";
  for (let i = 0; i < 12; i++) {
    pwd += chars[Math.floor(Math.random() * chars.length)];
  }
  return pwd;
}

// ─── Session helpers ──────────────────────────────────────────────────────────

export async function createSession(userId: number): Promise<string> {
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(userSessions).values({ id, userId, expiresAt });
  return id;
}

export async function invalidateSession(sessionId: string): Promise<void> {
  await db
    .update(userSessions)
    .set({ invalidatedAt: new Date() })
    .where(eq(userSessions.id, sessionId));
}

export async function invalidateAllUserSessions(userId: number): Promise<void> {
  await db
    .update(userSessions)
    .set({ invalidatedAt: new Date() })
    .where(and(eq(userSessions.userId, userId), isNull(userSessions.invalidatedAt)));
}

/** Look up an active session; return the userId or null. */
export async function resolveSession(sessionId: string): Promise<number | null> {
  const rows = await db
    .select()
    .from(userSessions)
    .where(
      and(
        eq(userSessions.id, sessionId),
        isNull(userSessions.invalidatedAt),
        gt(userSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return rows[0]?.userId ?? null;
}

// ─── User fetching ────────────────────────────────────────────────────────────

export async function getUserById(id: number): Promise<User | null> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);
  return rows[0] ?? null;
}

export async function getUserPermissions(userId: number): Promise<{
  modules: ModuleKey[];
  reportSubKeys: ReportSubKey[];
}> {
  const [modRows, repRows] = await Promise.all([
    db.select().from(userPermissions).where(eq(userPermissions.userId, userId)),
    db.select().from(userReportPermissions).where(eq(userReportPermissions.userId, userId)),
  ]);
  return {
    modules: modRows.map(r => r.module as ModuleKey),
    reportSubKeys: repRows.map(r => r.reportSubKey as ReportSubKey),
  };
}

export async function getSafeUser(user: User): Promise<SafeUser> {
  const perms = await getUserPermissions(user.id);
  const { passwordHash: _ph, ...rest } = user;
  return { ...rest, ...perms };
}

// ─── Middleware ────────────────────────────────────────────────────────────────

declare module "express-serve-static-core" {
  interface Request {
    sessionId?: string;
    currentUser?: User;
    currentUserPerms?: { modules: ModuleKey[]; reportSubKeys: ReportSubKey[] };
  }
}

const SESSION_COOKIE = "smarteo_session";

/** Attach session/user info to the request if a valid session cookie exists. */
export async function attachSession(req: Request, _res: Response, next: NextFunction) {
  const sessionId = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (!sessionId) return next();

  const userId = await resolveSession(sessionId);
  if (!userId) return next();

  const user = await getUserById(userId);
  if (!user) return next();

  req.sessionId = sessionId;
  req.currentUser = user;
  req.currentUserPerms = await getUserPermissions(userId);
  next();
}

/** Require a valid, active (non-suspended) session. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.currentUser) {
    return res.status(401).json({ message: "Authentication required." });
  }
  if (req.currentUser.accountState === "suspended") {
    return res.status(403).json({ message: "Your account has been suspended. Contact your administrator." });
  }
  next();
}

/** Require admin role. Must be used after requireAuth. */
export function requireAdminRole(req: Request, res: Response, next: NextFunction) {
  if (!req.currentUser) {
    return res.status(401).json({ message: "Authentication required." });
  }
  if (req.currentUser.role !== "admin") {
    return res.status(403).json({ message: "Admin access required." });
  }
  next();
}

/** Set the session cookie on the response. */
export function setSessionCookie(res: Response, sessionId: string) {
  res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL_MS,
    path: "/",
  });
}

/** Clear the session cookie. */
export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}
