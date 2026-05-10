import type { Request, Response, NextFunction } from "express";
import "express-session";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { users, type User, type SafeUser, type UserRole } from "@shared/schema";

declare module "express-session" {
  interface SessionData {
    userId?: number;
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SafeUser;
    }
  }
}

const BCRYPT_COST = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

function toSafeUser(user: User): SafeUser {
  const { passwordHash: _omit, ...safe } = user;
  return safe;
}

export async function findUserByEmail(email: string): Promise<User | undefined> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);
  return rows[0];
}

export async function findUserById(id: number): Promise<User | undefined> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0];
}

export interface CreateUserInput {
  email: string;
  name: string;
  role: UserRole;
  title?: string | null;
  password: string;
}

export async function createUser(input: CreateUserInput): Promise<SafeUser> {
  const passwordHash = await hashPassword(input.password);
  const [row] = await db
    .insert(users)
    .values({
      email: input.email.trim().toLowerCase(),
      name: input.name.trim(),
      role: input.role,
      title: input.title ?? null,
      passwordHash,
    })
    .returning();
  return toSafeUser(row);
}

export interface UpdateUserInput {
  email?: string;
  name?: string;
  role?: UserRole;
  title?: string | null;
  password?: string;
}

export async function updateUser(id: number, input: UpdateUserInput): Promise<SafeUser | null> {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.email !== undefined) patch.email = input.email.trim().toLowerCase();
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.role !== undefined) patch.role = input.role;
  if (input.title !== undefined) patch.title = input.title;
  if (input.password !== undefined) patch.passwordHash = await hashPassword(input.password);

  const [row] = await db.update(users).set(patch).where(eq(users.id, id)).returning();
  return row ? toSafeUser(row) : null;
}

export async function deleteUser(id: number): Promise<boolean> {
  const result = await db.delete(users).where(eq(users.id, id)).returning({ id: users.id });
  return result.length > 0;
}

export async function listUsers(): Promise<SafeUser[]> {
  const rows = await db.select().from(users).orderBy(users.createdAt);
  return rows.map(toSafeUser);
}

export async function touchLastLogin(id: number): Promise<void> {
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, id));
}

function destroySessionSafely(req: Request) {
  if (req.session) {
    try {
      req.session.destroy(() => {});
    } catch {
      /* noop — destroy may throw if store is unavailable; we still 401 */
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userId = req.session?.userId;
  if (!userId) {
    return res.status(401).json({ message: "Authentication required" });
  }
  const user = await findUserById(userId);
  if (!user) {
    destroySessionSafely(req);
    return res.status(401).json({ message: "Authentication required" });
  }
  req.user = toSafeUser(user);
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = req.session?.userId;
  if (!userId) {
    return res.status(401).json({ message: "Authentication required" });
  }
  const user = await findUserById(userId);
  if (!user) {
    destroySessionSafely(req);
    return res.status(401).json({ message: "Authentication required" });
  }
  if (user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  req.user = toSafeUser(user);
  next();
}

/**
 * If the users table is empty AND BOOTSTRAP_ADMIN_EMAIL + BOOTSTRAP_ADMIN_PASSWORD
 * env vars are set, create the first admin user. Idempotent: skipped after first run.
 */
export async function bootstrapAdminIfNeeded(): Promise<void> {
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length > 0) return;

  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "Owner";

  if (!email || !password) {
    console.warn(
      "[auth] Users table is empty and BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD env vars are not set. " +
        "No one will be able to log in. Set both env vars in Replit Secrets and restart.",
    );
    return;
  }
  if (password.length < 8) {
    console.error("[auth] BOOTSTRAP_ADMIN_PASSWORD must be at least 8 characters. Skipping bootstrap.");
    return;
  }

  await createUser({ email, name, role: "admin", password });
  console.log(`[auth] Bootstrapped first admin user: ${email}`);
}

export { toSafeUser };
