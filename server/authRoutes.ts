/**
 * server/authRoutes.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * All auth and user-management API routes:
 * - POST /api/auth/login
 * - POST /api/auth/logout
 * - GET  /api/auth/me
 * - POST /api/auth/change-password
 * - GET    /api/admin/users
 * - POST   /api/admin/users
 * - GET    /api/admin/users/:id
 * - PATCH  /api/admin/users/:id
 * - POST   /api/admin/users/:id/suspend
 * - POST   /api/admin/users/:id/reactivate
 * - POST   /api/admin/users/:id/reset-password
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Express, Request, Response } from "express";
import { db } from "./db";
import {
  users,
  userPermissions,
  userReportPermissions,
  MODULE_KEYS,
  REPORT_SUB_KEYS,
  type ModuleKey,
  type ReportSubKey,
} from "@shared/schema";
import {
  hashPassword,
  verifyPassword,
  generateTempPassword,
  createSession,
  invalidateSession,
  invalidateAllUserSessions,
  getUserByEmail,
  getUserById,
  getUserPermissions,
  getSafeUser,
  requireAuth,
  requireAdminRole,
  setSessionCookie,
  clearSessionCookie,
} from "./auth";
import { eq, desc, and, ne } from "drizzle-orm";
import { z } from "zod";

// ─── Validation schemas ────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

const createUserSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["admin", "user"]),
  modules: z.array(z.enum(MODULE_KEYS as unknown as [string, ...string[]])),
  reportSubKeys: z.array(z.enum(REPORT_SUB_KEYS as unknown as [string, ...string[]])),
});

const updateUserSchema = z.object({
  fullName: z.string().min(1).optional(),
  role: z.enum(["admin", "user"]).optional(),
  modules: z.array(z.enum(MODULE_KEYS as unknown as [string, ...string[]])).optional(),
  reportSubKeys: z.array(z.enum(REPORT_SUB_KEYS as unknown as [string, ...string[]])).optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function setUserPermissions(
  userId: number,
  modules: string[],
  reportSubKeys: string[],
) {
  await db.delete(userPermissions).where(eq(userPermissions.userId, userId));
  await db.delete(userReportPermissions).where(eq(userReportPermissions.userId, userId));

  if (modules.length > 0) {
    await db.insert(userPermissions).values(
      modules.map(m => ({ userId, module: m as ModuleKey })),
    );
  }
  if (reportSubKeys.length > 0) {
    await db.insert(userReportPermissions).values(
      reportSubKeys.map(k => ({ userId, reportSubKey: k as ReportSubKey })),
    );
  }
}

function buildLoginUrl(req: Request): string {
  const host = req.headers["host"] ?? "localhost:5000";
  const proto = process.env.NODE_ENV === "production" ? "https" : "http";
  return `${proto}://${host}/login`;
}

// ─── Route registration ───────────────────────────────────────────────────────

export function registerAuthRoutes(app: Express) {

  // ── POST /api/auth/login ────────────────────────────────────────────────────
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid email or password." });
    }

    const { email, password } = parsed.data;
    const user = await getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    if (user.accountState === "suspended") {
      return res.status(403).json({ message: "Your account has been suspended. Contact your administrator." });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    await db
      .update(users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, user.id));

    const sessionId = await createSession(user.id);
    setSessionCookie(res, sessionId);

    const safeUser = await getSafeUser(user);
    return res.json({
      user: safeUser,
      requiresPasswordChange:
        user.accountState === "first_login_required" ||
        user.accountState === "password_reset_required",
    });
  });

  // ── POST /api/auth/logout ───────────────────────────────────────────────────
  app.post("/api/auth/logout", requireAuth, async (req: Request, res: Response) => {
    if (req.sessionId) {
      await invalidateSession(req.sessionId);
    }
    clearSessionCookie(res);
    return res.json({ ok: true });
  });

  // ── GET /api/auth/me ────────────────────────────────────────────────────────
  app.get("/api/auth/me", async (req: Request, res: Response) => {
    if (!req.currentUser) {
      return res.status(401).json({ message: "Not authenticated." });
    }
    if (req.currentUser.accountState === "suspended") {
      clearSessionCookie(res);
      return res.status(403).json({ message: "Account suspended." });
    }
    const safeUser = await getSafeUser(req.currentUser);
    return res.json({
      user: safeUser,
      requiresPasswordChange:
        req.currentUser.accountState === "first_login_required" ||
        req.currentUser.accountState === "password_reset_required",
    });
  });

  // ── POST /api/auth/change-password ─────────────────────────────────────────
  app.post("/api/auth/change-password", requireAuth, async (req: Request, res: Response) => {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request." });
    }

    const user = req.currentUser!;
    const { currentPassword, newPassword } = parsed.data;

    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ message: "Current password is incorrect." });
    }

    if (newPassword === currentPassword) {
      return res.status(400).json({ message: "New password must be different from your current password." });
    }

    const newHash = await hashPassword(newPassword);
    await db
      .update(users)
      .set({ passwordHash: newHash, accountState: "active", tempCredentialBlock: null, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    return res.json({ ok: true });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Admin routes — require auth + admin role
  // ────────────────────────────────────────────────────────────────────────────

  // ── GET /api/admin/users ────────────────────────────────────────────────────
  app.get("/api/admin/users", requireAuth, requireAdminRole, async (_req: Request, res: Response) => {
    const allUsers = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        role: users.role,
        accountState: users.accountState,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        createdBy: users.createdBy,
        suspendedAt: users.suspendedAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt));

    return res.json(allUsers);
  });

  // ── POST /api/admin/users ───────────────────────────────────────────────────
  app.post("/api/admin/users", requireAuth, requireAdminRole, async (req: Request, res: Response) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request." });
    }

    const { fullName, email, role, modules, reportSubKeys } = parsed.data;

    const existing = await getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ message: "A user with that email already exists." });
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);
    const loginUrl = buildLoginUrl(req);
    const credentialBlock = `SmartEO Account Created\n\nName: ${fullName}\nEmail: ${email}\nAccess Level: ${role === "admin" ? "Admin" : "User"}\nTemporary Password: ${tempPassword}\nLogin URL: ${loginUrl}\n\nInstructions:\n• Log in using the email and temporary password above\n• You will be required to change your password on first login`;

    const [newUser] = await db
      .insert(users)
      .values({
        fullName,
        email: email.toLowerCase().trim(),
        passwordHash,
        role,
        accountState: "first_login_required",
        createdBy: req.currentUser!.id,
        tempCredentialBlock: credentialBlock,
      })
      .returning();

    await setUserPermissions(newUser.id, modules, reportSubKeys);

    return res.status(201).json({
      user: {
        id: newUser.id,
        fullName: newUser.fullName,
        email: newUser.email,
        role: newUser.role,
        accountState: newUser.accountState,
        createdAt: newUser.createdAt,
      },
      tempPassword,
      credentialBlock,
    });
  });

  // ── GET /api/admin/users/:id ────────────────────────────────────────────────
  app.get("/api/admin/users/:id", requireAuth, requireAdminRole, async (req: Request, res: Response) => {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) return res.status(400).json({ message: "Invalid user ID." });

    const user = await getUserById(userId);
    if (!user) return res.status(404).json({ message: "User not found." });

    const perms = await getUserPermissions(userId);
    const { passwordHash: _ph, ...rest } = user;

    return res.json({ ...rest, ...perms });
  });

  // ── PATCH /api/admin/users/:id ──────────────────────────────────────────────
  app.patch("/api/admin/users/:id", requireAuth, requireAdminRole, async (req: Request, res: Response) => {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) return res.status(400).json({ message: "Invalid user ID." });

    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request." });
    }

    const { fullName, role, modules, reportSubKeys } = parsed.data;

    const user = await getUserById(userId);
    if (!user) return res.status(404).json({ message: "User not found." });

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (fullName !== undefined) updates.fullName = fullName;
    if (role !== undefined) updates.role = role;

    if (Object.keys(updates).length > 1) {
      await db.update(users).set(updates).where(eq(users.id, userId));
    }

    if (modules !== undefined || reportSubKeys !== undefined) {
      const existingPerms = await getUserPermissions(userId);
      await setUserPermissions(
        userId,
        modules ?? existingPerms.modules,
        reportSubKeys ?? existingPerms.reportSubKeys,
      );
    }

    const updated = await getUserById(userId);
    const perms = await getUserPermissions(userId);
    const { passwordHash: _ph, ...rest } = updated!;

    return res.json({ ...rest, ...perms });
  });

  // ── POST /api/admin/users/:id/suspend ──────────────────────────────────────
  app.post("/api/admin/users/:id/suspend", requireAuth, requireAdminRole, async (req: Request, res: Response) => {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) return res.status(400).json({ message: "Invalid user ID." });

    if (userId === req.currentUser!.id) {
      return res.status(400).json({ message: "You cannot suspend your own account." });
    }

    const user = await getUserById(userId);
    if (!user) return res.status(404).json({ message: "User not found." });

    await db
      .update(users)
      .set({
        accountState: "suspended",
        suspendedAt: new Date(),
        suspendedBy: req.currentUser!.id,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    await invalidateAllUserSessions(userId);

    return res.json({ ok: true });
  });

  // ── POST /api/admin/users/:id/reactivate ────────────────────────────────────
  app.post("/api/admin/users/:id/reactivate", requireAuth, requireAdminRole, async (req: Request, res: Response) => {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) return res.status(400).json({ message: "Invalid user ID." });

    const user = await getUserById(userId);
    if (!user) return res.status(404).json({ message: "User not found." });

    await db
      .update(users)
      .set({
        accountState: "active",
        suspendedAt: null,
        suspendedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    return res.json({ ok: true });
  });

  // ── POST /api/admin/users/:id/reset-password ────────────────────────────────
  app.post("/api/admin/users/:id/reset-password", requireAuth, requireAdminRole, async (req: Request, res: Response) => {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) return res.status(400).json({ message: "Invalid user ID." });

    const user = await getUserById(userId);
    if (!user) return res.status(404).json({ message: "User not found." });

    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);
    const loginUrl = buildLoginUrl(req);
    const credentialBlock = `SmartEO Password Reset\n\nName: ${user.fullName}\nEmail: ${user.email}\nAccess Level: ${user.role === "admin" ? "Admin" : "User"}\nTemporary Password: ${tempPassword}\nLogin URL: ${loginUrl}\n\nInstructions:\n• Log in using the email and temporary password above\n• You will be required to change your password on first login`;

    await db
      .update(users)
      .set({
        passwordHash,
        accountState: "password_reset_required",
        tempCredentialBlock: credentialBlock,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    await invalidateAllUserSessions(userId);

    return res.json({ tempPassword, credentialBlock });
  });

  // ── GET /api/admin/users/:id/credentials ────────────────────────────────────
  app.get("/api/admin/users/:id/credentials", requireAuth, requireAdminRole, async (req: Request, res: Response) => {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) return res.status(400).json({ message: "Invalid user ID." });

    const [row] = await db
      .select({ accountState: users.accountState, tempCredentialBlock: users.tempCredentialBlock })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!row) return res.status(404).json({ message: "User not found." });

    const available =
      (row.accountState === "first_login_required" || row.accountState === "password_reset_required") &&
      !!row.tempCredentialBlock;

    return res.json({
      available,
      credentialBlock: available ? row.tempCredentialBlock : null,
    });
  });
}
